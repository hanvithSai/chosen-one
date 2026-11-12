/**
 * Cuts every recorded scene to its exact narrated length, burns in captions from the timing
 * manifest, and muxes the narration. Because scene lengths, caption times and the audio track
 * all come from the same manifest, picture, text and voice stay in sync.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("build/manifest.json", "utf8"));
const S = Object.fromEntries(manifest.scenes.map((s) => [s.id, s]));
mkdirSync("build/clips", { recursive: true });
mkdirSync("out", { recursive: true });
/** Video time (s) at which the magenta sync flash ends, i.e. scene time zero. */
function syncTime(file) {
  const raw = execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      file,
      "-t",
      "25",
      "-vf",
      "fps=25,scale=2:2",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "-",
    ],
    { maxBuffer: 1 << 26 },
  );
  const frame = 2 * 2 * 3;
  let last = -1;
  for (let i = 0; i * frame + frame <= raw.length; i++) {
    const r = raw[i * frame],
      g = raw[i * frame + 1],
      b = raw[i * frame + 2];
    if (r > 200 && g < 70 && b > 200) last = i;
  }
  if (last < 0) throw new Error(`no sync flash found in ${file}`);
  return (last + 1) / 25;
}
const ff = (args) => execFileSync("ffmpeg", ["-y", "-v", "error", ...args], { stdio: "inherit" });
const BASE_VF = "fps=25,scale=1280:720:flags=lanczos,setsar=1";
const ENC = [
  "-an",
  "-c:v",
  "libx264",
  "-preset",
  "medium",
  "-crf",
  "18",
  "-pix_fmt",
  "yuv420p",
  "-r",
  "25",
];

/** A plain scene: take `duration` seconds after the recorded lead-in. */
function plain(id) {
  const lead = syncTime(`build/vid/${id}.webm`);
  console.log(`${id}: sync at ${lead.toFixed(2)}s`);
  ff([
    "-ss",
    String(lead),
    "-i",
    `build/vid/${id}.webm`,
    "-vf",
    `${BASE_VF},tpad=stop_mode=clone:stop_duration=3`,
    "-t",
    String(S[id].duration),
    ...ENC,
    `build/clips/${id}.mp4`,
  ]);
}

/** Retimes segments [start, end, targetSeconds] of one recording and joins them to `total` seconds. */
function retimed(src, segments, total, out) {
  const parts = segments.map(([a, b, target], i) => {
    const factor = Math.min(target / (b - a), 1.7);
    return `[0:v]trim=start=${a}:end=${b},setpts=(PTS-STARTPTS)*${factor.toFixed(4)},${BASE_VF}[v${i}]`;
  });
  const labels = segments.map((_, i) => `[v${i}]`).join("");
  const filter = `${parts.join(";")};${labels}concat=n=${segments.length}:v=1:a=0,tpad=stop_mode=clone:stop_duration=4[o]`;
  ff(["-i", src, "-filter_complex", filter, "-map", "[o]", "-t", String(total), ...ENC, out]);
}

const reuse = process.env.SKIP_CLIPS === "1";
if (!reuse && process.env.S7_ONLY !== "1")
  for (const id of ["s1", "s2", "s3", "s4", "s5", "s6", "s8", "s9"]) plain(id);

const m0 = JSON.parse(readFileSync("build/vid/s7.json", "utf8"));
const delta = syncTime("build/vid/s7.webm") - m0.sync0;
console.log(`s7: video clock is ${delta.toFixed(2)}s ahead of the page clock`);
const m = Object.fromEntries(
  Object.entries(m0).map(([k, v]) => [
    k,
    typeof v === "number" && k !== "aDur" && k !== "pDur" ? v + delta : v,
  ]),
);
const aTotal = S.s7a.duration;
const pTotal = S.s7b.duration;
const tA = m.send + 0.8 - (m.typeStart - 1.0);
const tB = 3.0;
if (!reuse) {
  retimed(
    "build/vid/s7.webm",
    [
      [m.typeStart - 1.0, m.send + 0.8, tA],
      [m.send + 0.8, m.reply - 0.3, tB],
      [m.reply - 0.3, m.clickPay, aTotal - tA - tB],
    ],
    aTotal,
    "build/clips/s7a.mp4",
  );
  // PayPal checkout: skim the loading screens, hold on card selection and on the final page.
  const pp = [
    [m.clickPay, m.paypalLoaded, 0.8],
    [m.paypalLoaded, m.review, 2.6],
    [m.review, m.card, 2.4],
    [m.card, m.returned, 1.4],
    [m.returned, m.end, pTotal - 0.8 - 2.6 - 2.4 - 1.4],
  ];
  retimed("build/vid/s7.webm", pp, pTotal, "build/clips/s7b.mp4");
}

const order = ["s1", "s2", "s3", "s4", "s5", "s6", "s7a", "s7b", "s8", "s9"];
writeFileSync("build/concat.txt", order.map((id) => `file 'clips/${id}.mp4'`).join("\n"));
ff(["-f", "concat", "-safe", "0", "-i", "build/concat.txt", "-c", "copy", "build/silent.mp4"]);

// Captions, timed from the same manifest as the audio.
const stamp = (t) => {
  const ms = Math.round(t * 1000);
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};
let n = 1;
let srt = "";
for (const scene of manifest.scenes) {
  for (const s of scene.sentences) {
    srt += `${n++}\n${stamp(scene.start + s.offset)} --> ${stamp(scene.start + s.offset + s.duration + 0.2)}\n${s.caption}\n\n`;
  }
}
writeFileSync("build/captions.srt", srt);
writeFileSync("out/captions.srt", srt);

const total = manifest.totalDuration;
const style =
  "FontName=Arial,FontSize=10,Bold=1,PrimaryColour=&H00FFFFFF&,OutlineColour=&H00000000&,BackColour=&HA0140F0B&,BorderStyle=3,Outline=1,Shadow=0,MarginV=10,Alignment=2";
execFileSync(
  "ffmpeg",
  [
    "-y",
    "-v",
    "error",
    "-i",
    "silent.mp4",
    "-i",
    "narration.wav",
    "-vf",
    `subtitles=captions.srt:original_size=1280x720:force_style='${style}',fade=t=in:st=0:d=0.4,fade=t=out:st=${(total - 0.7).toFixed(2)}:d=0.7`,
    "-af",
    `volume=-2dB,aresample=44100,afade=t=in:st=0:d=0.2,afade=t=out:st=${(total - 0.8).toFixed(2)}:d=0.8`,
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-t",
    String(total),
    "-movflags",
    "+faststart",
    "../out/chosenone-demo.mp4",
  ],
  { stdio: "inherit", cwd: "build" },
);
console.log(`done: out/chosenone-demo.mp4 (${total.toFixed(1)}s)`);
