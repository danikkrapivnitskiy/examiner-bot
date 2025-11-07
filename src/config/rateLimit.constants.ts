/** Default per-user sliding window limits when middleware config omits overrides. */
export const rateLimitDefaultMaxRequests = 10;
export const rateLimitDefaultWindowSeconds = 60;
export const rateLimitDefaultKeyPrefix = 'tg:rate-limit';

/** TTL buffer so the Redis key outlives the sliding window slightly. */
export const rateLimitExpireBufferSeconds = 1;
