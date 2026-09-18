# Twenty Minds — Should CWI Deploy Gate v1.0.0 ship now (public repo + GitHub Pages)?

Date: 2026-09-18. Pre-run lean: **ship**.

## Facts (max 5)

1. 21/21 tests pass, zero dependencies; 4/4 historical bug classes caught in dry-run (DISTRICT_BEACONS scope 2026-09-17, hardcoded SAMPLE/LIVE labels 2026-09-18, Pages cache split-brain 2026-09-17, preventive secret scan).
2. Dogfooding: the gate is clean on its own codebase (self-scan flags only the 5 intentional fixtures; secret fixtures use obviously-fake values and the scan never prints values).
3. PLAN.md kill rule — "catches zero real historical bug classes in dry-run before v1 → do not ship" — is satisfied 4/4.
4. Ship cost is $0; public MIT repo; nothing under any secrets/ directory ships.
5. Static analysis is heuristic — false positives possible on exotic code; real proof comes from adoption on CWI deploys.

## Verdicts (one sentence + one risk each)

1. Skeptic — Ship; the strongest argument against waiting is that every "one more precision pass" so far has been paid for by dogfooding, and the next pass will be too.
   Risk: the skeptic's confidence is built on 21 tests the author wrote himself — the test suite has never been attacked by a hostile reader.
2. Data scientist — Ship; 4/4 historical catches plus 21/21 green is the measured result the kill rule demanded, and there is no metric on the table that waiting would improve.
   Risk: the sample is four hand-reproduced incidents — n=4 proves the gate catches what it was built to catch, not what the next deploy will contain.
3. User advocate — Ship; the user of this gate is the deployer at 2 AM who needs a red/green answer, and a shipped gate with documented suppressions serves them better than a perfect gate in a drawer.
   Risk: a false positive at 2 AM with no maintainer awake serves nobody — the suppression syntax must be discoverable in the finding message itself.
4. Contrarian — Don't ship yet; a gate that was just rewritten twice today (depth → scope-identity → enclosing-scope params) has not had a single quiet week, and quiet weeks are what prove stability.
   Risk: "wait for a quiet week" is how tools die in branches — the contrarian has no date, only a feeling.
5. Engineer — Ship; zero dependencies, a 5-minute read of lib/gate.js, deterministic output, and exit codes 0/1/2 make this the most maintainable artifact in the trust-layer program.
   Risk: the tokenizer is hand-rolled — the first minified bundle or exotic syntax it chokes on will produce a confusing finding, not a clean error.
6. Economist — Ship; $0 marginal cost, and every deploy it saves from a DISTRICT_BEACONS-class outage repays the build cost in one incident.
   Risk: the incentive cuts the other way too — a free gate nobody runs has zero value, and nothing in the repo enforces adoption.
7. Security reviewer — Ship, but only because the secret scan was just hardened against self-referential false positives and the fixtures are obviously fake; re-audit the fixture values once more before the push.
   Risk: a fixture value that looks fake today (`sk-test-FAKE-0000`) trains nobody to spot a real one pasted next to it tomorrow.
8. Child-of-five explainer — Ship, because "it checks your work before it goes live, like spell-check for deploys" is a sentence anyone understands.
   Risk: spell-check also flags correct words sometimes, and the five-year-old will ask why.
9. 10-year historian — Ship; in 2036 the record will show this as the first trust-layer product that encoded a real outage into a check, which is exactly what the program promised.
   Risk: historians also record the v1 that shipped with a scope checker rewritten twice in one day — the record keeps the warts.
10. Devil's accountant — Ship; the true cost is already sunk (one build day), the compounding cost is near zero (no deps, no infra), and the hidden cost is only the maintenance of precision.
    Risk: precision maintenance is the whole hidden cost — every false positive report is a support ticket with no revenue attached.
11. Field operator — Ship; my worst Tuesday is a deploy blocked by a finding I don't understand, and the per-line `deploy-gate: allow` suppression plus the JSON output make that Tuesday survivable.
    Risk: the operator will blanket-suppress instead of understanding, and the gate will become a checkbox.
12. Systems thinker — Ship; the gate creates the feedback loop the program needs — every future outage becomes a fixture, which becomes a check, which prevents the next outage.
    Risk: the loop only closes if someone actually encodes the next outage — without that discipline the gate fossilizes at four checks.
13. Risk underwriter — Ship; the tail risk of shipping is a public repo with a heuristic linter (reputational, small), while the tail risk of not shipping is another phone-screenshot outage with no gate to blame but us.
    Risk: underwriting ignores the middle risk — the gate becomes famous for one loud false positive and teams route around it.
14. Open-source maintainer — Ship; a stranger can read the README, run `node bin/deploy-gate.js .`, and understand every finding message without asking us anything — that is the bar, and it clears it.
    Risk: strangers will file issues about JavaScript the tokenizer can't parse, and each one is a design decision disguised as a bug report.
15. Negotiator — Ship; the other side here is the next deploy, and its best move is another seam-between-tests failure — our walk-away is a gate that already covers the four seams we know.
    Risk: negotiating against the last four incidents leaves us exposed to the fifth, which by definition we haven't priced.
16. Time traveler (2036) — Ship; looking back, the gate that shipped at v1.0.0 with four encoded scars became the template for the whole trust layer, and the two rewrites are a footnote.
    Risk: the traveler might be remembering the version that survived, not this one — survivorship bias is doing a lot of work in this verdict.
17. First-principles physicist — Ship; what must be true is that deploys fail in the seams between tests, and a static check over the deploy tree is the irreducible mechanism for seam failures — there is no simpler machine that does this job.
    Risk: "irreducible" is doing heavy lifting — a smoke test that boots the page would also catch the scope class, and for some deploys it would be simpler.
18. Ethicist — Ship; no one is harmed by a public linter, the fixtures are fake, the values are never printed, and honest SAMPLE/LIVE labeling is itself an ethical stance the gate enforces.
    Risk: the gate's authority could be misused to block a deploy for political reasons — any gate is a lever, and levers get pulled.
19. Competitor analyst — Ship; the strongest competitor answer to "how do you prevent deploy outages" is a CI pipeline with tests, and none of them encode their own outage history as checks — this is the lane they aren't in.
    Risk: they aren't in this lane because heuristic linters don't demo well — the differentiator is real but unglamorous.
20. Black's chair — Ship; verified or it didn't happen — 21/21 green, 4/4 catches, dogfood clean, $0, kill rule satisfied — and fire always means a staged, verified launch doesn't wait for permission.
    Risk: fire always still demands the staging be right — one real secret in the fixtures and the launch is a breach, not a shipment.

## Synthesis

- **Decision:** Ship v1.0.0 to the public repo and GitHub Pages now.
- **Why:** the data scientist's measured kill-rule satisfaction (4/4 catches, 21/21 tests), the engineer's maintainability read (zero deps, deterministic, honest exit codes), and Black's chair's verified-or-it-didn't-happen bar converged — every number the plan demanded is on the table, and waiting has no metric attached.
- **Dissent recorded:** the contrarian's strongest minority — the scope checker was rewritten twice in one day and has had no quiet week; honor it by treating the first month as a probation period where every false positive gets a precision fix within one deploy cycle (already written into docs/KILL-RULE.md).
- **Confidence:** high — the single fact that would change it: a real (non-fake) secret value discovered anywhere in the shipping tree.
- **Changed the pre-run lean?** no — lean was ship; this is the first no-change run on the deploy-gate decision stream (one more no-change → drop to 5 minds per the kill criterion).
