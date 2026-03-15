import pino from 'pino';
function buildLogger() {
    const isDev = process.env['NODE_ENV'] === 'development' ||
        process.env['NODE_ENV'] === undefined;
    if (isDev) {
        return pino({
            level: 'debug',
            transport: {
                target: 'pino-pretty',
                options: {
                    colorize: true,
                    translateTime: 'HH:MM:ss',
                    ignore: 'pid,hostname',
                },
            },
        });
    }
    return pino({
        level: 'info',
    });
}
export const logger = buildLogger();
//# sourceMappingURL=logger.js.map