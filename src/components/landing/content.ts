/**
 * Landing page copy. The FAQ is also published as FAQPage structured data in index.html;
 * tests/landing.test.ts keeps the two in step.
 */

export const DISCLAIMER = "Out of 100. Measures how well the CV covers this posting and how safely it parses. It does not predict shortlisting.";

export const STEPS = [
  {
    title: "Upload your CV",
    body: "Drop in a PDF, single or two column. ATStra reads it in the right order and shows you exactly what an applicant tracking system sees.",
  },
  {
    title: "Paste the job description",
    body: "Paste the posting or a link to it. ATStra pulls out the must-have and nice-to-have terms and scores your CV against them.",
  },
  {
    title: "Review, then download",
    body: "Accept, skip or reword each suggestion one at a time. Download a clean, single-column Word file in the template you like.",
  },
] as const;

export const RUBRIC = [
  { name: "Keyword coverage", weight: 35, body: "Share of the posting's terms your CV covers. Must-haves count double." },
  { name: "Evidence and impact", weight: 20, body: "Bullets in your two most recent roles that carry a number and an outcome." },
  { name: "Parse safety", weight: 20, body: "Readable text, one column, standard headings, nothing hidden in headers, tables or text boxes." },
  { name: "Title and summary fit", weight: 15, body: "Your headline and summary name the role, the domain and the top terms early." },
  { name: "Hygiene", weight: 10, body: "Length, date format, contact details and spelling." },
] as const;

export const TRUST_POINTS = [
  {
    title: "Every edit shows its evidence",
    body: "A suggestion only survives if it quotes a line already in your CV. If the quote is not there, the suggestion is dropped before you ever see it.",
  },
  {
    title: "No invented numbers",
    body: "If a rewrite needs a metric you did not write, ATStra asks you for it instead of guessing. Your words go in exactly as you typed them.",
  },
  {
    title: "Missing skills stay missing until you say so",
    body: "A must-have term with no support in your CV is marked unverified. It can only be added after you confirm you have the experience and say where.",
  },
  {
    title: "You decide, line by line",
    body: "There is no accept-all button on purpose. You see the current text, the proposed text and the points it is worth, then choose.",
  },
] as const;

export const PRIVACY_POINTS = [
  "Your CV and exports sit in private storage. Download links expire after 60 seconds.",
  "Your name, email, phone and links are removed before the job analysis runs.",
  "No analytics, ad trackers or third-party scripts.",
  "Delete a CV or an application and its files go with it.",
] as const;

export const FAQ = [
  {
    q: "What is an ATS, and why does it matter for my CV?",
    a: "An applicant tracking system (ATS) is the software many employers use to collect and search applications. It reads your CV as plain text. Multi-column layouts, tables and text boxes can scramble that text, and a CV that describes your work in different words from the job posting can be harder to find. ATStra checks both.",
  },
  {
    q: "How is the ATStra score calculated?",
    a: "The score is out of 100 and is calculated in code from a published rubric: keyword coverage (35), evidence and impact (20), parse safety (20), title and summary fit (15) and hygiene (10). The same CV and job description always give the same score. It measures coverage and parse safety. It does not predict shortlisting.",
  },
  {
    q: "Will ATStra make things up on my CV?",
    a: "No. Every suggested rewrite must quote evidence that is already in your CV, and suggestions that invent numbers, employers, job titles, degrees or tools are dropped or turned into a question for you. Nothing reaches your exported CV unless it was already there or you typed or confirmed it.",
  },
  {
    q: "What file do I get at the end?",
    a: "An editable, single-column Word document (DOCX) with real headings and bullet lists, in one of five templates. It works for portal uploads and for emailing recruiters, and you can polish it further in Word or Google Docs.",
  },
  {
    q: "Does it work with two-column or designed CVs?",
    a: "Yes. Upload the PDF as it is. ATStra reads the columns in the right order, flags the layout in the parse check and exports a single-column version that applicant tracking systems read cleanly.",
  },
  {
    q: "Who can sign up?",
    a: "Anyone with a Gmail address. Sign in with Google and your account is created on the spot. Each account sees only its own CVs and applications. You can run up to 30 job analyses a day.",
  },
  {
    q: "What happens to my data?",
    a: "Your files are kept in private storage and only you can open them. Contact details are removed before the job analysis runs, there are no analytics or ad trackers, and deleting a CV or application deletes its files.",
  },
] as const;
