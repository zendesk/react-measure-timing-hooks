# tracing

## how to set valid timeouts for a trace?

starting point: take your current metric's p99 and double your time
The idea is to set it safely high (starting points for certain types of traces?) so we dont clamp down too early and lose important data points that wont be reflected.

if you don't have any reference metrics,
use your best guess - under the worst conditions, what's the longest you can expect your trace to take?
and then multiply that by 1.5 or 2?
you can start with a high value, close to the limit of what you're expecting the trace to take

depending on the type of interaction - is it a cold boot, or a page navigation, or a small interaction like opening a dropdown?

collect some data (how long?)

monitor how many timeouts you're seeing in your trace (how can we easily see % of timeouts?)
if they're not stable and they make up a large portion of your traces, you need to increase the timeout

recommendation: timeouts should be below 1% (?) of your traces
(already added section to RFC) who owns monitoring the trace timeout proportion? the team that owns the trace definition.

### compromise

if the timeouts are too short, you might be clamping the max length, and affecting the data quality

if the timeouts are too long, we can start interrupting other traces, due to the limit one trace can only occur at a time

### ...

how broad should be the rules for debouncing?
problem of accidentally extending the duration of the trace due to user's interaction