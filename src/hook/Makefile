CC      ?= gcc
CFLAGS  := -Wall -Wextra -fPIC -shared -O2 -s
LDFLAGS := -ldl
TARGET  := dapipe_hook.so
SRC     := dapipe_hook.c

.PHONY: all clean

all: $(TARGET)

$(TARGET): $(SRC)
	$(CC) $(CFLAGS) -o $@ $< $(LDFLAGS)

clean:
	rm -f $(TARGET)
