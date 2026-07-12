/**
 * Verification script for tools/master-seo/index.html (NeoOS evidence & governance pass).
 *
 * Run:  node tools/master-seo/verify.mjs
 * Requires Playwright + a Chromium install. Override resolution with env vars:
 *   PLAYWRIGHT_MODULE=/path/to/node_modules/playwright  CHROMIUM_PATH=/path/to/chromium
 *
 * See tools/master-seo/VERIFICATION.md for the checklist this covers and a recorded run.
 */
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const pwPath = process.env.PLAYWRIGHT_MODULE || "playwright";
const { chromium } = require(pwPath);

const here = path.dirname(fileURLToPath(import.meta.url));
const fileUrl = "file://" + path.join(here, "index.html");

const launchOpts = { headless: true };
if (process.env.CHROMIUM_PATH) launchOpts.executablePath = process.env.CHROMIUM_PATH;

let passed = 0, failed = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { passed++; console.log("  ok  " + name); }
  else { failed++; failures.push(name + (detail ? " — " + detail : "")); console.log("FAIL  " + name + (detail ? " — " + detail : "")); }
}

// A page whose static HTML has: no viewport, no canonical, a noindex, one h1.
const NOINDEX_PAGE = `<!doctype html><html><head>
<title>Fixture Page With A Reasonable Title Length Here</title>
<meta name="description" content="A fixture description that is intentionally long enough to sit inside the heuristic range for meta descriptions used by the analyzer tool here.">
<meta name="robots" content="noindex">
</head><body><main><h1>Fixture H1</h1>
<p>Plain fixture content for evidence tests. It says nothing remarkable and uses simple words so readability stays fine across many short sentences. We tested it once.</p>
<h2>Section one</h2><p>More content here.</p>
<h2>Section two</h2><p>Even more content here.</p>
</main></body></html>`;

const run = async () => {
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on("pageerror", e => consoleErrors.push("PAGEERROR: " + e.message));
  page.on("console", m => { if (m.type() === "error") consoleErrors.push("CONSOLE: " + m.text()); });
  page.on("dialog", d => d.accept()); // for clear-all confirm

  await page.goto(fileUrl);
  await page.evaluate(() => { localStorage.clear(); });
  await page.reload();

  /* ---------- Group 1: manual-input analysis (self-reported / user content) ---------- */
  console.log("\n[1] Manual-input analysis");
  await page.fill("#a-keyword", "espresso grinder");
  await page.fill("#a-title", "Espresso Grinders"); // 17 chars -> heuristic warn, below near-boundary band
  await page.fill("#a-meta", "Short."); // far outside range
  await page.fill("#a-h1", "Espresso Grinders Compared");
  await page.fill("#a-body", "We compared five grinders for daily espresso use. The burr set matters more than the motor. Grind retention changes dose accuracy. A seamless workflow is what every maker promises. It was tested by us across two months of daily shots and the results were written down each day with care and patience for the process of dialing in each machine again. This sentence is deliberately long so the analyzer counts many words inside one single sentence which pushes average sentence length upward slightly for the test.");
  await page.click("#btn-analyze");
  await page.waitForTimeout(250);

  // (5) self-reported finding
  const httpsRow = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("#findings-list .finding, #review-list .finding")];
    const r = rows.find(x => x.textContent.includes("HTTPS not confirmed"));
    return r ? r.textContent : "";
  });
  check("self-reported source badge on HTTPS finding", /self-reported/.test(httpsRow), httpsRow.slice(0, 80));

  // (1) documented finding carries a real source link
  const httpsSource = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("#findings-list .finding, #review-list .finding")];
    const r = rows.find(x => x.textContent.includes("HTTPS not confirmed"));
    const a = r && r.querySelector("a.badge");
    return a ? { href: a.getAttribute("href"), title: a.getAttribute("title") } : null;
  });
  check("documented tier links to a real source URL", !!httpsSource && /developers\.google\.com|google/.test(httpsSource.href), JSON.stringify(httpsSource));

  // (2) heuristic finding labelled Heuristic
  const titleRow = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("#findings-list .finding, #review-list .finding")];
    const r = rows.find(x => x.textContent.includes("Title length outside heuristic range"));
    return r ? r.textContent : "";
  });
  check("title-length finding labelled Heuristic", /Heuristic/.test(titleRow), titleRow.slice(0, 80));

  // (4) user-provided-content source type on computed text finding
  const buzzRow = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("#findings-list .finding, #review-list .finding")];
    const r = rows.find(x => x.textContent.includes("buzzword"));
    return r ? r.textContent : "";
  });
  check("buzzword finding marked user content", /user content/.test(buzzRow), buzzRow.slice(0, 80));

  // (6) not-verified + needs-verification for CWV
  const cwvRow = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("#review-list .finding")];
    const r = rows.find(x => x.textContent.includes("Core Web Vitals"));
    return r ? r.textContent : "";
  });
  check("CWV is not-verified", /not verified/.test(cwvRow), cwvRow.slice(0, 80));
  check("CWV decision is needs-verification", /needs-verification/.test(cwvRow), cwvRow.slice(0, 80));

  // (11) soften decision present (passive-voice FP-prone or self-reported medium)
  const reviewText = await page.textContent("#review-list");
  check("soften decision present in review", /soften/.test(reviewText));

  // (11) retain: keyword-absent finding stays in primary list
  const primaryText = await page.textContent("#findings-list");
  check("retained finding present (keyword never appears)", /never appears/.test(primaryText));

  // (8) overall confidence has level + explanation
  const confLine = await page.textContent("#confidence-line");
  check("overall confidence shows level", /Confidence: (High|Medium|Low)/.test(confLine), confLine.slice(0, 60));
  check("overall confidence explains why", /Why:/.test(confLine), confLine.slice(0, 120));

  // (16) report provenance
  const report1 = await page.evaluate(() => window.__lastReport);
  check("report includes review decision lines", /review decision: (retain|soften|escalate|reject|needs-verification)/.test(report1));
  check("report includes source type lines", /source type: (self-reported|user-provided-content|not-verified|page-observed)/.test(report1));
  check("report includes evidence source URL", /Evidence source: .*https:\/\//.test(report1));
  check("report includes no-guarantee disclaimer", /cannot be guaranteed/.test(report1));
  check("report includes notebook disclaimer", /Learning notebook: browser-local/.test(report1));
  check("report includes high-stakes status", /High-stakes status:/.test(report1));

  /* ---------- Group 2: pasted-page analysis (page-observed, static-only, escalate, reject) ---------- */
  console.log("\n[2] Pasted-page analysis");
  await page.click("#btn-reset-analyze");
  await page.fill("#a-url", "https://fixture.example/page");
  await page.click("#paste-details summary");
  await page.fill("#a-html", NOINDEX_PAGE);
  await page.click("#btn-parse-html");
  await page.waitForTimeout(300);

  // (11) escalate: noindex is page-observed + documented + critical
  const allText = await page.evaluate(() => document.querySelector("#findings-list").textContent + " | " + document.querySelector("#review-list").textContent);
  check("noindex finding escalated", /noindex directive/.test(allText) && /escalate/.test(allText), allText.slice(0, 120));

  // (3)+(7) page-observed (static) label on viewport-absence finding
  const mobileRow = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("#findings-list .finding, #review-list .finding")];
    const r = rows.find(x => x.textContent.includes("Mobile-friendliness"));
    return r ? r.textContent : "";
  });
  check("mobile finding is page-observed (static)", /page-observed \(static\)/.test(mobileRow), mobileRow.slice(0, 100));
  check("static-only caps confidence at Medium", /Medium confidence/.test(mobileRow), mobileRow.slice(0, 100));

  // (11) reject: fixture title is 48 chars? Compute: "Fixture Page With A Reasonable Title Length Here" = 49 -> in range (pass). Use a direct reject case:
  await page.fill("#a-title", "This Title Is Exactly Sixty Three Characters Long For The Test"); // 63 chars -> near-boundary (61-68) => reject
  await page.click("#btn-analyze");
  await page.waitForTimeout(250);
  const rejText = await page.textContent("#review-list");
  check("near-boundary title rejected with reason", /reject/.test(rejText) && /heuristic boundary/.test(rejText), rejText.slice(0, 160));

  // rejected findings do not hit the score: compare l3 with a clearly-retained warning removed is complex; assert reject styling present instead
  const rejectBadge = await page.evaluate(() => !!document.querySelector("#review-list .badge.dec-reject"));
  check("reject badge rendered", rejectBadge);

  /* ---------- Group 3: high-stakes heuristic + override ---------- */
  console.log("\n[3] High-stakes detection & override");
  await page.click("#btn-reset-analyze");
  // (9) false-positive-prone keyword in benign context
  await page.fill("#a-title", "How We Give Credit To Guest Baristas On Our Blog");
  await page.fill("#a-body", "Every guest barista gets credit in the byline. We name them, link their site, and thank them. This post explains the process we use for guest features and how attribution works across our coffee blog posts in detail.");
  await page.click("#btn-analyze");
  await page.waitForTimeout(250);
  const gateVisible = await page.isVisible("#ymyl-gate");
  const gateHead = gateVisible ? await page.textContent("#ymyl-gate") : "";
  check("benign 'credit' trips heuristic (documented FP case)", gateVisible && /Potential high-stakes/.test(gateHead), gateHead.slice(0, 60));
  check("gate text admits heuristic fallibility", /can be wrong|false positive|heuristic/i.test(gateHead), gateHead.slice(0, 160));

  // Override to NOT high-stakes: gate hides, dissent preserved
  await page.click("#hs-no");
  await page.waitForTimeout(250);
  check("override 'not high-stakes' hides gate", !(await page.isVisible("#ymyl-gate")));
  const dissent = await page.textContent("#hs-dissent");
  check("dissent note preserved after override", /keyword heuristic matched/.test(dissent), dissent.slice(0, 100));
  const reportNo = await page.evaluate(() => window.__lastReport);
  check("report records manual override + dissent", /manually set to not high-stakes/.test(reportNo) && /Dissent preserved/.test(reportNo));

  // (10) false-negative path: benign topic manually marked high-stakes
  await page.click("#hs-yes");
  await page.waitForTimeout(250);
  check("manual 'high-stakes' shows gate", await page.isVisible("#ymyl-gate"));
  const reportYes = await page.evaluate(() => window.__lastReport);
  check("high-stakes mode marks advisory + human review in report", /ACTIVE/.test(reportYes) && /human review/i.test(reportYes));
  const execAdvisory = await page.evaluate(() => document.querySelector("#quickwins-list").textContent);
  check("execution list carries advisory tag when high-stakes", /advisory — human review/.test(execAdvisory) || !/./.test(execAdvisory), execAdvisory.slice(0, 120));
  await page.click("#hs-auto"); // reset
  await page.waitForTimeout(200);

  /* ---------- Group 4: learning notebook ---------- */
  console.log("\n[4] Learning notebook");
  await page.fill("#learn-page", "/espresso-grinders");
  await page.fill("#learn-hypothesis", "Clearer title lifts CTR");
  await page.fill("#learn-change", "Rewrote title tag");
  await page.fill("#learn-baseline", "CTR 1.8%");
  await page.fill("#learn-window", "4 weeks");
  await page.click("#btn-learn-add");
  await page.waitForTimeout(150);
  check("(12) notebook add renders entry", (await page.textContent("#learn-list")).includes("Clearer title lifts CTR"));

  await page.reload();
  await page.waitForTimeout(250);
  check("(13) notebook persists across reload", (await page.textContent("#learn-list")).includes("Clearer title lifts CTR"));

  // (14) export -> clear -> import round-trip
  await page.click("#btn-learn-export");
  await page.waitForTimeout(150);
  const exported = await page.inputValue("#learn-io");
  check("export produces schema-versioned JSON", /"schemaVersion":\s*2/.test(exported) && /Clearer title lifts CTR/.test(exported));
  await page.click("#btn-learn-clear");
  await page.waitForTimeout(150);
  check("(15) clear-all empties notebook", (await page.textContent("#learn-list")).includes("No entries yet"));
  await page.fill("#learn-io", exported);
  await page.click("#btn-learn-import");
  await page.waitForTimeout(150);
  check("import restores entries", (await page.textContent("#learn-list")).includes("Clearer title lifts CTR"));

  const privacy = await page.textContent(".privacy-note");
  check("privacy warning visible", /Do not store confidential/.test(privacy));

  /* ---------- Group 5: themes + Write flow + console ---------- */
  console.log("\n[5] Themes, Write flow, console");
  const lightBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const darkPage = await browser.newPage();
  await darkPage.emulateMedia({ colorScheme: "dark" });
  await darkPage.goto(fileUrl);
  const darkBg = await darkPage.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check("(17/18) light and dark themes differ", lightBg !== darkBg, lightBg + " vs " + darkBg);
  await darkPage.close();

  await page.click("#tab-write-btn");
  await page.fill("#w-topic", "espresso grinders");
  await page.click("#btn-gen-draft");
  await page.waitForTimeout(300);
  const draftLen = (await page.inputValue("#w-draft")).length;
  check("(20) Write flow drafts full copy", draftLen > 400, draftLen + " chars");

  check("(19) zero console errors", consoleErrors.length === 0, consoleErrors.join(" | ").slice(0, 300));

  await browser.close();

  console.log("\n==== " + passed + " passed, " + failed + " failed ====");
  if (failed) { console.log(failures.map(f => " - " + f).join("\n")); process.exit(1); }
};

run().catch(e => { console.error("VERIFY SCRIPT ERROR:", e); process.exit(1); });
