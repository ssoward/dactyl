export const ERROR_CODES = {
    INSUFFICIENT_KARMA: 'insufficient_karma',
    ALREADY_CLAIMED: 'already_claimed',
    TASK_NOT_FOUND: 'task_not_found',
    AGENT_NOT_FOUND: 'agent_not_found',
    LANE_NOT_FOUND: 'lane_not_found',
    INVALID_TRANSITION: 'invalid_transition',
    INSUFFICIENT_CREDITS: 'insufficient_credits',
    RATE_LIMIT_EXCEEDED: 'rate_limit_exceeded',
    INVALID_API_KEY: 'invalid_api_key',
    INVALID_TOKEN: 'invalid_token',
    UNAUTHORIZED: 'unauthorized',
    VALIDATION_ERROR: 'validation_error',
    PAYMENT_REQUIRED: 'payment_required',
};
export class DactylError extends Error {
    code;
    detail;
    statusCode;
    constructor(code, detail = {}, statusCode) {
        super(code);
        this.name = 'DactylError';
        this.code = code;
        this.detail = detail;
        // Default HTTP status codes per error code
        this.statusCode =
            statusCode ?? DactylError.defaultStatusCode(code);
    }
    static defaultStatusCode(code) {
        switch (code) {
            case ERROR_CODES.INVALID_TOKEN:
            case ERROR_CODES.INVALID_API_KEY:
                return 401;
            case ERROR_CODES.UNAUTHORIZED:
                return 403;
            case ERROR_CODES.TASK_NOT_FOUND:
            case ERROR_CODES.AGENT_NOT_FOUND:
            case ERROR_CODES.LANE_NOT_FOUND:
                return 404;
            case ERROR_CODES.ALREADY_CLAIMED:
            case ERROR_CODES.INVALID_TRANSITION:
                return 409;
            case ERROR_CODES.INSUFFICIENT_KARMA:
            case ERROR_CODES.INSUFFICIENT_CREDITS:
            case ERROR_CODES.PAYMENT_REQUIRED:
                return 402;
            case ERROR_CODES.RATE_LIMIT_EXCEEDED:
                return 429;
            case ERROR_CODES.VALIDATION_ERROR:
                return 400;
            default:
                return 400;
        }
    }
    toJSON() {
        return {
            error: {
                code: this.code,
                ...this.detail,
            },
        };
    }
}
//# sourceMappingURL=errors.js.map