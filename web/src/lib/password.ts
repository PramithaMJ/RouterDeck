const WORDS =
  "amber anchor apple arrow aspen atlas autumn bamboo basil beacon birch bloom breeze brook canyon cedar cherry cinnamon citrus clover cobalt comet coral cosmos crystal dawn delta ember falcon fern forest galaxy garnet ginger glacier harbor hazel horizon indigo island jade jasmine jungle lagoon lemon lotus maple meadow mango marble meteor mint monsoon nectar ocean olive orbit orchid pebble pepper pine planet prism quartz rain river saffron sage sapphire shadow sierra silver sky spice spruce storm summit sunset tiger topaz tulip valley velvet willow winter".split(
    " ",
  );

function rand(n: number) {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] % n;
}

/** Easy to read aloud, hard to guess: "maple-orbit-58-river" (≈ 40+ bits). */
export function generateWifiPassword(): string {
  const w = () => WORDS[rand(WORDS.length)];
  return `${w()}-${w()}-${10 + rand(90)}-${w()}`;
}

export function passwordStrength(pw: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  if (!pw) return { score: 0, label: "" };
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (pw.length >= 16) s++;
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  if (classes >= 3) s++;
  if (/^(.)\1+$/.test(pw) || /^(12345678|password|qwerty|11111111|00000000)/i.test(pw)) s = 1;
  const score = Math.min(4, s) as 0 | 1 | 2 | 3 | 4;
  return { score, label: ["Too short", "Weak", "Okay", "Strong", "Very strong"][score] };
}
