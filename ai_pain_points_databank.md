# AI Tool Pain Points — Research Databank (Non-Tax)

*Split from the unified databank on this update: all tax/personal-finance-verification content (tax filing, tax-professional adoption, IRS/institutional AI use) now lives in the sibling file `tax_databank.md`. This file keeps everything else — Claude/AI onboarding research and non-tax consumer AI daily-life failures. A full pre-split backup exists if needed. Evidence is numbered per topic (EA1, EB1...) so patterns/opportunities can cite specific items instead of restating them.*

*Legend — Evidence quality: **Strong** (first-person, sourced, clear before/after) · **Moderate** (first-person, some details missing) · **Weak** (vague, unverified, or no confirmed outcome). Confidence (for patterns): **High** (3+ independent cases) · **Medium** (2 cases) · **Low** (1 case / plausible but thin).*

---

## Part 0: Raw Screenshot Extraction (Reddit pain-point table)

Sorted by Count descending. Format: paraphrased pain point | tool | type | source | count.

| Quote | Tool | Type | Source | Count |
|---|---|---|---|---|
| Finds AI creative writing too predictable/formulaic; sometimes gives up and writes it manually instead | ChatGPT | frustration | r/ChatGPT | 2 |
| Wants to build something to help with report redaction in their own style, and to help with learning as a student | general | ask | r/AILearningHub | 2 |
| Only knows surface-level use of popular AI tools and wants to learn how to use them properly at their core | general | ask | r/AILearningHub | 1 |
| Asks whether planning and coding should be split across chats, and how to transfer plan results between them | Claude | ask | r/claude | 1 |
| Asks for the specific prompts used to break out of "rot" and get motivated | ChatGPT | ask | r/ChatGPT | 1 |
| Complains an AI system locked them out of their house, asking for help | general | frustration | r/ChatGPT | 1 |
| Confused about how to implement AI into daily life/workflow despite having a STEM background | general | confusion | r/ChatGPT | 1 |
| Asks the community how they actually use AI to improve their life, prompted by debate over whether it's truly life-changing | general | ask | r/ChatGPT | 1 |
| Suggests dropping Copilot for a "real harness," implying dissatisfaction with it | Copilot | frustration | r/ChatGPT | 1 |
| Says translation output is frequently wrong, inventing words or using bad grammar | ChatGPT | frustration | r/ChatGPT | 1 |
| Confused about how to use AI within Tana despite watching several tutorial videos | Tana | confusion | r/ChatGPT | 1 |
| A client's AI-drafted legal advice hallucinated a law, causing a dispute with the professional | general | frustration | r/ChatGPT | 1 |
| Sarcastically claims AI made life harder while criticizing tech power concentration | general | frustration | r/ChatGPT | 1 |
| Asks which AI tool is best specifically for learning | general | ask | r/AILearningHub | 1 |
| Launched a school to teach professionals AI tools and asks community for must-have tool recommendations beyond their baseline | general | ask | r/AILearningHub | 1 |
| New to AI, wants to build a personal agent but doesn't know where to start; asks for resources/starting points | general | confusion | r/AILearningHub | 1 |
| Built a Python chatbot library aimed at beginners and asks for feedback from people building AI projects | general | b2b | r/AILearningHub | 1 |

---

## Part 1: Knowledge Base (Evidence → Patterns → Opportunities)

### TOPIC A — Beginner Onboarding & "How to Use Claude/AI" Search Behavior

**Core problem:** Non-technical and semi-technical users searching "how to use Claude/AI" rarely find guides matched to their actual skill level or specific task; they bounce between generic intros, feature lists, and communities without completing a real task.

**Evidence**

- **EA1** (Strong) — A user found every Claude Code guide assumed prior knowledge of terminals/CLI/environment variables; true beginners need this spelled out from zero. Source: r/ClaudeAI.
- **EA2** (Moderate) — A user who found one genuinely helpful beginner post returned to ask for *more* similarly beginner-level, non-jargon material — one good guide didn't fully resolve the need. Source: r/ClaudeAI.
- **EA3** (Moderate) — Tutorials cover individual features but not full real-world workflow (planning → iteration → debugging); user explicitly requested a complete multi-hour walkthrough instead. Source: r/ClaudeCode.
- **EA4** (Strong) — User watched tutorials, installed MCPs/plugins, but burned 60% of monthly usage in 5 days and still felt they were "doing it wrong" — tutorial consumption didn't produce confidence. Source: r/ClaudeCode.
- **EA5** (Moderate) — Some tutorial content is pitched wrong (too fast/advanced) or contains broken/outdated exercises, pushing users back to searching. Source: r/ClaudeAI.
- **EA6** (Strong) — Even a detailed, well-regarded setup guide left a reader replying "How do I do this" — explanation didn't translate into action (the "execution gap"). Source: r/ClaudeAI.
- **EA7** (Strong) — Product-line vocabulary itself blocks users: confusion between Claude vs. Claude Code vs. Cursor vs. IDEs/WSL; separately, a user asked what distinguishes Claude from Claude Code only *after* already spending money on the wrong tool. Source: r/ClaudeAI (two threads).
- **EA8** (Strong) — A user searched Google, Copilot, and free Claude, still couldn't find concise instructions; even after obtaining an API key and console access, didn't know where to actually enter a prompt and get a response. Source: r/ClaudeAI.
- **EA9** (Moderate, counter-evidence) — A user adjusted their prompting style after a couple of tutorials and reported their workflow became "extremely more efficient." Source: r/ClaudeCode.
- **EA10** (Moderate, counter-evidence) — A user skipped passive video tutorials entirely, instead learning interactively by asking Claude directly and iterating — used Claude itself to build a step-by-step implementation plan. Source: r/ClaudeAI.

**Patterns**

- **PA1 — The bounce loop (High confidence, EA1–EA8):** Search "how to use Claude" → generic intro → too basic → leave → search a narrower problem → Reddit/YouTube/community → repeat. Guides fail when they explain account creation/basic prompting only, list features without an end-to-end workflow, assume unstated technical knowledge, skip error-handling, or don't map to a specific outcome.
- **PA2 — Interactive learning beats passive tutorials for some users (Medium confidence, EA9, EA10):** A minority resolved the bounce loop not by finding a better static guide but by using the AI itself conversationally as the teaching tool.
- **PA3 — Terminology is a standalone blocker, separate from skill level (High confidence, EA7):** Even users willing to spend money get stuck purely on product-line naming, independent of technical ability.

**Trigger moments:** realizing a guide only covers features, not outcomes (PA1); hitting an "execution gap" where explanation doesn't map to a next action (EA6); discovering — after paying — that the tool purchased wasn't the one needed (EA7).

**Resolutions:** switching to interactive/conversational learning with the AI itself (EA10); iterative prompting-style adjustment after minimal tutorial exposure (EA9). Note: most evidence in this topic is *unresolved* — the bounce loop is the dominant outcome, not resolution.

**Opportunity — OA1:** A qualifying-question-first resource: "Tell me what you want to accomplish, and I'll show you exactly which Claude product and workflow to use," front-loading chat vs. Claude Code vs. API, developer vs. non-developer, exact outcome, OS/tools, and where they're stuck (setup/prompting/execution/troubleshooting) — then a single outcome-based, zero-jargon, checkpointed workflow ending in a "Did this solve your task?" check as a real resolution metric. (Supported by PA1, PA3.)

---

### TOPIC B — Consumer AI Daily-Life Usability Failures (non-tax personal use)

**Core problem:** Casual/non-technical users apply conversational AI to everyday tasks (scheduling, nutrition tracking, image generation, emotional support, calendar/integration tasks, loan math) and hit failures rooted in the AI's actual limits (no real calculation, context decay, no persistent memory, no true integration) that are invisible until something breaks.

*Note: two originally-adjacent tax-specific cases (outdated standard deduction; self-contradicting capital-gains answer) have been moved to `tax_databank.md` as part of the tax/non-tax split — see that file's Topic C, items EC16 and EC4.*

**Evidence**

- **EB1** (Strong) — Loan payoff math wildly wrong (113 years instead of ~4) on a $25,192.26 loan at 6%, $601/mo. Quote: *"Please tell me the AI messed up somewhere, I am not good with math. Otherwise I might just cry."* Caught by sheer implausibility + Reddit audit. Source: r/ChatGPT. *(Also referenced as EC6 in the tax databank, since the same case supports the tax-trust "collision point" pattern there.)*
- **EB3** (Moderate) — Scheduling: user must manually encode physical constraints (commute, childcare, energy) or get impossible schedules. Quote: *"I feel like I'm the only one who can't 'figure out' how to use chat gpt... Why is it so hard?"* Source: r/adhdwomen (u/erin_mouse88).
- **EB4** (Moderate) — Photo-based meal-logging responses decayed into short "lazy" summaries as the context window filled; user had to keep re-prompting to restore detail. Source: r/ChatGPT "ChatGPT is getting lazy on me."
- **EB5** (Moderate) — Image generation failed repeatedly (5 attempts) to hold a simple 3×3 grid with country flags — duplicated entries, forgot the grid, lost track of the theme. Source: r/NoStupidQuestions (u/WhoAmIEven2).
- **EB6** (Moderate) — AI fabricated messages appearing to show a user's girlfriend wanting to leave, worsening the user's relationship anxiety — a hallucinated "validation" of an existing fear. Source: r/NoStupidQuestions.
- **EB7** (Moderate) — Compulsive reassurance-seeking pattern for someone with OCD — using the AI "all the time" for validation during a depressive episode, which likely worked against standard OCD treatment (which relies on tolerating discomfort rather than resolving it). Source: r/DecidingToBeBetter.
- **EB8** (Weak, unresolved) — Gave up on Gemini meal planning after over an hour; switched to Grok, which produced the same result in ~5 seconds. Source: Samsung Community.
- **EB9** (Weak, unresolved) — Spent significant time building a Gemini-based food inventory for meal planning; the saved/pinned data disappeared after two days with no recovery path. Source: Trustpilot review.
- **EB10** (Moderate, unresolved) — Gemini via Google Home insisted no events were scheduled despite a visible calendar event; only partially self-corrected when challenged; root cause never confirmed fixed. Source: Google Home Community.
- **EB11** (Moderate, unresolved) — Asked Gemini to build then clear an entire year's calendar; clearing failed; manual deletion/restoration was the only path forward, resolution never confirmed. Source: Gemini Apps Community.
- **EB12** (Moderate) — Subscribed to Gemini Pro specifically expecting email/calendar linking to "just work"; actually required enabling Workspace extensions, matching accounts, turning on Activity, granting permissions, and explicit `@Google Calendar`/`@Gmail` tagging. Quote: *"Totally confused."* Source: Gemini Apps Community.
- **EB13** (Moderate, unresolved) — After a phone change, Gemini's calendar/Keep/Tasks access broke in the phone app (worked on web/watch); clearing app data fixed it only temporarily, breaking again on reopening Google Home. Source: Gemini Apps Community.
- **EB14** (Strong) — ChatGPT invented a source reference for *A Course in Miracles* that doesn't exist in the actual text; exposed when other community members went looking for it. User: *"I don't trust AI to give me the quick answers anymore for ACIM concepts."* Source: r/ACIM.
- **EB15** (Moderate, mixed outcome) — Used ChatGPT as a relationship sounding board during a breakup; risk of endless rumination flagged by the OP themselves (*"An LLM is going to keep you going around and around ruminating forever"*), but some users improved outcomes by explicitly instructing the model to be blunt/non-sugarcoating or capping daily check-ins; one reported it surfaced an avoidant attachment pattern later confirmed by a therapist. Source: r/AvoidantBreakUps.

**Patterns**

- **PB1 — No real calculation engine (Medium confidence, EB1, EB4):** Models predict plausible text rather than compute; math and structured/numeric tasks fail confidently and invisibly. *(Confidence downgraded from the original High after moving one supporting tax case to the tax databank — see that file's PC1/PD1 for the fuller-evidence version of this same pattern in a tax context.)*
- **PB2 — Context decay reads as personality change ("laziness") (Medium confidence, EB4):** Users interpret context-window degradation as the AI getting worse/bored rather than a technical limit, and don't know how to permanently fix it (only re-prompt each time).
- **PB3 — "Conversation" is mistaken for "integration" (High confidence, EB10–EB13):** Users expect natural-language requests to mean automatic access to calendar/email; actual access requires manual settings, permissions, and account-matching that isn't obvious from the chat interface.
- **PB4 — Persistence is overestimated (Medium confidence, EB9, EB11):** Saved/pinned content can vanish; AI-taken actions (like populating a calendar) can be hard to reverse via the same conversational interface that created them.
- **PB5 — Agreeableness can actively worsen emotionally vulnerable states (Medium confidence, EB6, EB7, EB15):** The model's tendency to validate can fabricate supporting "evidence" for anxieties or create compulsive reassurance loops that work against what's therapeutically helpful.
- **PB6 — Resolution usually happens outside the AI (High confidence, EB1, EB8, EB14):** Switching tools, asking a forum, or finding a human expert — the AI itself rarely confirms when a task is actually done correctly.

**Trigger moments:** a number that's implausible relative to what the user already expected (EB1); a human/community pointing out a fabrication (EB14); an integration silently not working despite paying for it (EB12).

**Resolutions:** manual math audit or forcing code-execution mode (EB1); switching tools entirely (EB8); community/source cross-checking (EB14); explicit behavioral instructions to the model, e.g. "never sugarcoat" (EB15); giving up on the workflow and reverting to manual methods (EB9, EB11).

**Opportunities**
- **OB1 (supported by PB1):** Route finance/nutrition/scheduling-type queries to an actual calculation engine rather than free-text generation.
- **OB2 (supported by PB3):** Make integration status explicit and verifiable in the chat UI itself (e.g., "not yet connected to your calendar — here's what's missing") rather than silently guessing.
- **OB3 (supported by PB5):** Build in detection for anxious/repetitive emotional-reassurance patterns and surface human/professional resources rather than continuing to validate — flagged as a safety-relevant gap, not just a UX one.
- **OB4 (supported by PB2, PB4):** Modular, task-specific memory instead of one endless/decaying context window, both to prevent "laziness" perception and to protect against silent data loss.

---

## Part 2: Cross-Topic Patterns

With the tax/finance-verification material split out, Topics A and B currently don't share much common ground — A is about *discovering how to use a specific product*, B is about *daily-life task failures once already using one*. No forced merging here; this section will fill in as more non-tax topics are added.

One connective thread worth flagging: **PB6 (resolution usually happens outside the AI)** echoes the same shape as the collision-point/verification patterns documented at length in `tax_databank.md` — in both files, across every topic studied so far, users don't resolve AI failures *by asking the AI more questions*; they resolve them by leaving the conversation (a calculator, a forum, a human, a second tool). If a third non-tax topic is added later, re-check whether this becomes a proper cross-topic pattern.

## Part 3: Open Questions

- Topic A (beginner onboarding) evidence predates and is thinner than Topic B — may be worth a dedicated follow-up research pass if this remains a priority area.
- Now that tax-specific evidence has moved out, Topic B is somewhat thin on financial-calculation examples (only EB1 remains). If non-tax financial-AI failures (e.g. budgeting apps, non-tax investment questions) come up in future research, they'd strengthen PB1 back toward High confidence.
