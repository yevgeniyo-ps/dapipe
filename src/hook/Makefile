CC      ?= gcc
CFLAGS  := -Wall -Wextra -fPIC -shared -O2 -fvisibility=hidden
LDFLAGS := -ldl -Wl,--version-script=exports.map
TARGET  := dapipe_hook.so
SRC     := dapipe_hook.c

.PHONY: all clean

all: $(TARGET)

$(TARGET): $(SRC) exports.map
	$(CC) $(CFLAGS) -o $@ $< $(LDFLAGS)
	strip --strip-unneeded $@

clean:
	rm -f $(TARGET)
