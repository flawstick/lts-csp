import type { SyncLogEntry, SyncLogLevel, SyncLogger } from "./types";

type SyncLogSink = (entry: SyncLogEntry) => Promise<void> | void;

interface LoggerState {
  sink?: SyncLogSink;
  pendingWrites: Set<Promise<void>>;
}

function writeToConsole(entry: SyncLogEntry) {
  const header = [entry.timestamp, "TAX-SYNC", entry.level.toUpperCase(), ...entry.prefix]
    .map((part) => `[${part}]`)
    .join("");

  if (entry.data && Object.keys(entry.data).length > 0) {
    console.log(`${header} ${entry.message}`, JSON.stringify(entry.data));
    return;
  }

  console.log(`${header} ${entry.message}`);
}

function buildEntry(
  level: SyncLogLevel,
  prefix: string[],
  message: string,
  data?: Record<string, unknown>,
): SyncLogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    prefix,
    message,
    data,
  };
}

function enqueueSinkWrite(state: LoggerState, entry: SyncLogEntry) {
  if (!state.sink) {
    return;
  }

  const pendingWrite = Promise.resolve()
    .then(() => state.sink?.(entry))
    .catch((error) => {
      console.error("[TAX-SYNC][LOGGER][ERROR] Failed to persist log entry", error);
    })
    .finally(() => {
      state.pendingWrites.delete(pendingWrite);
    });

  state.pendingWrites.add(pendingWrite);
}

function createLoggerInternal(prefix: string[], state: LoggerState): SyncLogger {
  const emit = (
    level: SyncLogLevel,
    message: string,
    data?: Record<string, unknown>,
  ) => {
    const entry = buildEntry(level, prefix, message, data);
    writeToConsole(entry);
    enqueueSinkWrite(state, entry);
  };

  return {
    info(message, data) {
      emit("info", message, data);
    },
    warn(message, data) {
      emit("warn", message, data);
    },
    error(message, data) {
      emit("error", message, data);
    },
    child(scope: string) {
      return createLoggerInternal([...prefix, scope], state);
    },
    async flush() {
      await Promise.allSettled([...state.pendingWrites]);
    },
  };
}

export function createLogger(...prefix: string[]): SyncLogger {
  return createLoggerInternal(prefix, {
    pendingWrites: new Set(),
  });
}

export function createLoggerWithSink(
  sink: SyncLogSink,
  ...prefix: string[]
): SyncLogger {
  return createLoggerInternal(prefix, {
    sink,
    pendingWrites: new Set(),
  });
}

export function combineLoggers(...loggers: SyncLogger[]): SyncLogger {
  return {
    info(message, data) {
      for (const logger of loggers) {
        logger.info(message, data);
      }
    },
    warn(message, data) {
      for (const logger of loggers) {
        logger.warn(message, data);
      }
    },
    error(message, data) {
      for (const logger of loggers) {
        logger.error(message, data);
      }
    },
    child(scope: string) {
      return combineLoggers(...loggers.map((logger) => logger.child(scope)));
    },
    async flush() {
      await Promise.all(loggers.map((logger) => logger.flush()));
    },
  };
}
