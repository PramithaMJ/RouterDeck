// Test harness: injected into the router's own tab to validate the runtime
// and drivers against real hardware (same-origin). Not part of the app build.
export { RouterPage } from "../src/lib/runtime/page";
export { SameOriginTransport } from "../src/lib/transport/same-origin";
export { realtekBoa } from "../src/lib/drivers/realtek-boa";
