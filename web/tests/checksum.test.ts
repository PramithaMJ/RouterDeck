// Vectors captured from a real SLT-Mobitel HG7 (fw v1.0.18) by running the
// router's own postTableEncrypt() on known inputs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { postSecurityFlag } from "../src/lib/drivers/realtek-boa/checksum.ts";

const V: [[string, string][], number][] = [
  [[], 65535],
  [[["a", "1"]], 28060],
  [[["a", "2"]], 27804],
  [[["a", "1"], ["b", "2"]], 55609],
  [[["a", ":"]], 14441],
  [[["a", " "]], 29596],
  [[["a", "é"]], 57121],
  [[["abcdefghij", "1"]], 41423],
  [[["submit-url", "/x"]], 14646],
  [[["srcmac", "aa:bb:cc:dd:ee:ff"], ["submit-url", "/x"]], 56329],
  [[["srcmac", "aa:bb:cc:dd:ee:fe"], ["submit-url", "/x"]], 56330],
  [[["a", "1"], ["go", "Add"]], 16008],
  [[["a", "1"], ["r", "2"]], 51513],
  [[["a", "1"], ["c", "on"]], 29937],
  [[["k", "kt9yt56c9"]], 3094],
  [[["k", "xycvqgexcv4xue"]], 44704],
  [[["k", "ldhc11uao3pgh"]], 53672],
  [[["a", "1"], ["postSecurityFlag", ""]], 28060],
];

test("postSecurityFlag matches the router", () => {
  for (const [pairs, expected] of V) assert.equal(postSecurityFlag(pairs), expected, JSON.stringify(pairs));
});
