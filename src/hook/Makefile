CC      ?= gcc
CFLAGS  := -Wall -Wextra -fPIC -shared -O2 -fvisibility=hidden
LDFLAGS := -ldl
TARGET  := dapipe_hook.so
SRC     := dapipe_hook.c

.PHONY: all clean

all: $(TARGET)

$(TARGET): $(SRC)
	$(CC) $(CFLAGS) -o $@ $< $(LDFLAGS)
	strip --strip-debug $@

clean:
	rm -f $(TARGET)
