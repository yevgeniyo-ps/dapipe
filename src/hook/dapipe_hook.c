/*
 * dapipe_hook.c — LD_PRELOAD shared library that intercepts outbound network
 * connections and DNS resolutions, logging them as JSON lines for later
 * analysis by DaPipe.
 *
 * Build:  make          (produces dapipe_hook.so)
 * Usage:  LD_PRELOAD=./dapipe_hook.so  DAPIPE_LOG_DIR=/tmp/dapipe  <cmd>
 */

#define _GNU_SOURCE
#include <dlfcn.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <fcntl.h>
#include <time.h>
#include <errno.h>
#include <pthread.h>

#include <sys/types.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <netdb.h>

/* ── Recursion guard ─────────────────────────────────────────────────── */
static __thread int in_hook = 0;

/* ── Thread-local hostname buffer for domain ↔ IP correlation ────────── */
static __thread char tls_hostname[256] = {0};

/* ── Original function pointers (resolved once via dlsym) ────────────── */
typedef int (*real_connect_t)(int, const struct sockaddr *, socklen_t);
typedef int (*real_getaddrinfo_t)(const char *, const char *,
                                  const struct addrinfo *,
                                  struct addrinfo **);

static real_connect_t    real_connect    = NULL;
static real_getaddrinfo_t real_getaddrinfo = NULL;

static void resolve_symbols(void) {
    if (!real_connect)
        real_connect = (real_connect_t)dlsym(RTLD_NEXT, "connect");
    if (!real_getaddrinfo)
        real_getaddrinfo = (real_getaddrinfo_t)dlsym(RTLD_NEXT, "getaddrinfo");
}

/* ── Helpers ─────────────────────────────────────────────────────────── */

/* JSON-escape a string into dst (must be large enough). */
static void json_escape(char *dst, size_t dstsz, const char *src) {
    size_t j = 0;
    for (size_t i = 0; src[i] && j + 6 < dstsz; i++) {
        switch (src[i]) {
            case '"':  dst[j++] = '\\'; dst[j++] = '"';  break;
            case '\\': dst[j++] = '\\'; dst[j++] = '\\'; break;
            case '\n': dst[j++] = '\\'; dst[j++] = 'n';  break;
            case '\r': dst[j++] = '\\'; dst[j++] = 'r';  break;
            case '\t': dst[j++] = '\\'; dst[j++] = 't';  break;
            default:   dst[j++] = src[i]; break;
        }
    }
    dst[j] = '\0';
}

/* Get the process name for the current pid. */
static void get_process_name(char *buf, size_t bufsz) {
    char path[64];
    snprintf(path, sizeof(path), "/proc/%d/comm", getpid());
    FILE *f = fopen(path, "r");
    if (f) {
        if (fgets(buf, bufsz, f)) {
            /* strip trailing newline */
            size_t len = strlen(buf);
            if (len > 0 && buf[len - 1] == '\n') buf[len - 1] = '\0';
        }
        fclose(f);
    } else {
        strncpy(buf, "unknown", bufsz - 1);
        buf[bufsz - 1] = '\0';
    }
}

/* Check if a value is in a comma-separated env var list. */
static int is_in_list(const char *env_var, const char *value) {
    if (!value || !value[0]) return 0;

    const char *list = getenv(env_var);
    if (!list || !list[0]) return 0;

    size_t len = strlen(list);
    if (len >= 4096) return 0;          /* sanity limit */
    char buf[4096];
    memcpy(buf, list, len + 1);

    char *saveptr = NULL;
    for (char *tok = strtok_r(buf, ",", &saveptr);
         tok;
         tok = strtok_r(NULL, ",", &saveptr)) {
        while (*tok == ' ') tok++;
        if (strcasecmp(tok, value) == 0)
            return 1;
    }
    return 0;
}

static int is_domain_blocked(const char *domain) {
    if (is_in_list("DAPIPE_BLOCKED_DOMAINS", domain))
        return 1;

    /* Restrict mode: if an allowlist is set, block anything NOT on it. */
    const char *allowed = getenv("DAPIPE_ALLOWED_DOMAINS");
    if (allowed && allowed[0]) {
        if (!is_in_list("DAPIPE_ALLOWED_DOMAINS", domain))
            return 1;
    }

    return 0;
}

static int is_ip_blocked(const char *ip) {
    return is_in_list("DAPIPE_BLOCKED_IPS", ip);
}

/* Write a JSON-lines entry atomically (O_APPEND guarantees on Linux). */
static void emit_log(const char *event, const char *domain,
                     const char *ip, int port) {
    const char *log_dir = getenv("DAPIPE_LOG_DIR");
    if (!log_dir || !log_dir[0]) return;

    char log_path[512];
    snprintf(log_path, sizeof(log_path), "%s/connections.jsonl", log_dir);

    int fd = open(log_path, O_WRONLY | O_CREAT | O_APPEND, 0644);
    if (fd < 0) return;

    struct timespec ts;
    clock_gettime(CLOCK_REALTIME, &ts);

    char proc[256];
    get_process_name(proc, sizeof(proc));

    char esc_domain[512], esc_ip[256], esc_proc[512], esc_event[64];
    json_escape(esc_domain, sizeof(esc_domain), domain);
    json_escape(esc_ip,     sizeof(esc_ip),     ip);
    json_escape(esc_proc,   sizeof(esc_proc),   proc);
    json_escape(esc_event,  sizeof(esc_event),  event);

    char line[2048];
    int len = snprintf(line, sizeof(line),
        "{\"ts\":%ld.%03ld,\"event\":\"%s\",\"domain\":\"%s\","
        "\"ip\":\"%s\",\"port\":%d,\"pid\":%d,\"ppid\":%d,"
        "\"process\":\"%s\"}\n",
        (long)ts.tv_sec, ts.tv_nsec / 1000000,
        esc_event, esc_domain, esc_ip, port,
        getpid(), getppid(), esc_proc);

    if (len > 0 && (size_t)len < sizeof(line)) {
        /* Best-effort atomic write */
        (void)write(fd, line, len);
    }
    close(fd);
}

/* ── Hooked: getaddrinfo ─────────────────────────────────────────────── */
int getaddrinfo(const char *node, const char *service,
                const struct addrinfo *hints, struct addrinfo **res) {
    resolve_symbols();

    if (in_hook || !node)
        return real_getaddrinfo(node, service, hints, res);

    in_hook = 1;

    /* Store hostname so the next connect() can correlate it. */
    strncpy(tls_hostname, node, sizeof(tls_hostname) - 1);
    tls_hostname[sizeof(tls_hostname) - 1] = '\0';

    /* Block resolution if domain is on the deny list. */
    if (is_domain_blocked(node)) {
        emit_log("blocked", node, "", 0);
        in_hook = 0;
        if (res) *res = NULL;
        return EAI_FAIL;
    }

    emit_log("dns", node, "", 0);

    in_hook = 0;
    return real_getaddrinfo(node, service, hints, res);
}

/* ── Hooked: connect ─────────────────────────────────────────────────── */
int connect(int sockfd, const struct sockaddr *addr, socklen_t addrlen) {
    resolve_symbols();

    if (in_hook || !addr)
        return real_connect(sockfd, addr, addrlen);

    in_hook = 1;

    char ip_buf[INET6_ADDRSTRLEN] = {0};
    int port = 0;

    if (addr->sa_family == AF_INET) {
        const struct sockaddr_in *sa4 = (const struct sockaddr_in *)addr;
        inet_ntop(AF_INET, &sa4->sin_addr, ip_buf, sizeof(ip_buf));
        port = ntohs(sa4->sin_port);
    } else if (addr->sa_family == AF_INET6) {
        const struct sockaddr_in6 *sa6 = (const struct sockaddr_in6 *)addr;
        inet_ntop(AF_INET6, &sa6->sin6_addr, ip_buf, sizeof(ip_buf));
        port = ntohs(sa6->sin6_port);
    }

    /* Only log TCP/IP connections (skip AF_UNIX, etc.) */
    if (ip_buf[0]) {
        const char *domain = tls_hostname[0] ? tls_hostname : "";

        /* Block connection if IP is on the deny list. */
        if (is_ip_blocked(ip_buf)) {
            emit_log("blocked", domain, ip_buf, port);
            tls_hostname[0] = '\0';
            in_hook = 0;
            errno = ECONNREFUSED;
            return -1;
        }

        emit_log("connect", domain, ip_buf, port);
        /* Clear so subsequent connects don't re-use a stale hostname */
        tls_hostname[0] = '\0';
    }

    in_hook = 0;
    return real_connect(sockfd, addr, addrlen);
}
