// Sample pair for the landing page's "Try with a sample" button (PRD F0.9).
// Fictional and anonymized: the person, company, school, employer and URLs are made up
// (links use the reserved example.com domain). Expected result: a Good fit with clear gaps
// (RAG / vector search, product analytics, Docker) and "eligible" from Morocco (EMEA).

export const SAMPLE_COUNTRY = 'MA';

export const SAMPLE_CV = `Adam Benjelloun
Junior AI / Full-Stack Developer
Rabat, Morocco · adam.benjelloun@example.com · https://adam.example.com · https://github.com/example-adam

SUMMARY
Junior developer who ships small AI products end to end, from prompt design to deployment on Cloudflare. Comfortable with TypeScript, React/Next.js and Python, and with using Claude Code and MCP to move fast while keeping the code tested.

EXPERIENCE
Software Engineering Intern, Kasbah Freight (logistics startup), Casablanca · Mar 2025 – Jun 2025
- Built an internal shipment-tracking dashboard in React and TypeScript, used daily by the 12-person operations team.
- Wrote a small Express REST API and SQL queries on PostgreSQL that replaced manual Excel exports.
- Added Jest unit tests to the API and a GitHub Actions workflow that runs them on every pull request.

PROJECTS
QuizLoop, viral personality-quiz web app · 2025 · live at https://quizloop.example.com
- Built and launched a Next.js app on Cloudflare Workers with D1 and KV, using Claude Code subagents to split work across front end, API and tests.
- Reached 38,000 visitors in the first 10 days after a TikTok post, with hosting kept at $0 on free tiers.
- Generated shareable result images at the edge and added per-IP rate limiting to protect the free quota.

ClipCraft, LLM content repurposer · 2025
- Python (FastAPI) tool that turns a long video transcript into a LinkedIn post, an X thread and a newsletter draft using the Gemini and Claude APIs.
- Designed structured JSON outputs with Pydantic validation and an automatic retry on invalid output.
- Built a small eval set of 25 transcripts to compare prompt versions before shipping changes.

Notes MCP server · 2025
- Wrote an MCP server in TypeScript that lets Claude search and summarize my Markdown notes.

EDUCATION
Bachelor's degree in Information Systems Engineering, Rabat School of Digital Engineering · 2022 – 2025
Relevant courses: databases, web development, software engineering, statistics.

SKILLS
Languages: JavaScript, TypeScript, Python, SQL
Front end: React, Next.js, Tailwind CSS
Back end and data: Node.js, Express, FastAPI, PostgreSQL, Cloudflare Workers, D1, KV
AI: LLM APIs (Claude, Gemini), prompt engineering, structured outputs, Claude Code, MCP
Tools: Git, GitHub Actions, Jest, Linux
Spoken languages: Arabic (native), French (fluent), English (professional working proficiency)`;

export const SAMPLE_JOB = `AI Product Engineer (Junior–Mid)
Quillstack · Remote (EMEA) · Full-time

About Quillstack
Quillstack helps customer-support teams answer faster. Our AI assistant drafts replies from a company's help center and past tickets, and support agents review and send them. We are a team of 14, backed by seed investors, and our product is used by 300+ support teams.

The role
You will build AI features end to end: from the prompt and the retrieval pipeline to the React interface agents use every day. You will work closely with our product lead and ship to production every week.

What you'll do
- Build and improve features in our Next.js and TypeScript app.
- Design prompts and structured outputs for our drafting assistant, and measure them with evals.
- Improve the retrieval pipeline that finds the right help-center articles for each ticket.
- Talk to customers with the product lead and turn feedback into small, shippable changes.

What you'll need
- 1+ year of professional experience building web products.
- Strong TypeScript and React skills.
- Experience integrating LLM APIs (OpenAI, Anthropic or Gemini) into real product features.
- Comfortable with SQL and a relational database (we use PostgreSQL).
- Hands-on experience with retrieval-augmented generation (embeddings, vector search such as pgvector).
- Clear written English: our team is distributed and writes a lot.

Nice to have
- Python for data and eval scripts.
- Experience building evals or prompt test sets.
- Experience with edge platforms such as Cloudflare Workers.
- Product analytics and experimentation (PostHog, A/B tests).
- Docker.

Location and hours
Fully remote. You can be based anywhere in EMEA (Europe, the Middle East or Africa). We hire as employees in the UK and Germany and as contractors elsewhere. We ask for at least 4 hours of overlap with CET (10:00–14:00).

What we offer
Salary 38,000–55,000 EUR depending on experience and location, a 1,500 EUR yearly learning budget, and a new laptop.

How to apply
Send your CV and a few lines about something you shipped. Our process: a 30-minute intro call, a 2-hour paid take-home task, and a final call with the founders.`;
