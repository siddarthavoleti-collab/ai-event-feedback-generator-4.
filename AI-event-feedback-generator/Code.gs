/**
 * AI Event Feedback Form Generator
 * --------------------------------
 * Input : a free-text event description
 * Output: a ready-to-share Google Form, customised to the event's
 *         purpose, activities and technical details.
 *
 * Flow:  Web page -> generateFeedbackForm() -> Gemini AI (designs questions as JSON)
 *        -> FormApp (builds the real Google Form) -> links shown on the page
 *
 * Setup: put your Gemini API key in Project Settings > Script Properties
 *        with the name GEMINI_API_KEY.
 */

// Models are tried in order. If one is busy (503) or rate-limited (429),
// the code waits briefly, retries, then falls back to the next model.
const MODELS = ['gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-2.5-flash'];

/** Serves the web page. */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('AI Event Feedback Form Generator')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Main entry point, called from the web page. */
function generateFeedbackForm(eventDescription) {
  if (!eventDescription || eventDescription.trim().length < 15) {
    throw new Error('Please describe the event in a bit more detail.');
  }
  const plan = askGemini_(eventDescription.trim());
  return buildForm_(plan);
}

/** Step 1: ask the AI to design the feedback form as structured JSON. */
function askGemini_(description) {
  const key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!key) {
    throw new Error('GEMINI_API_KEY is missing. Add it under Project Settings > Script Properties.');
  }

  const prompt = `You are an expert at designing event feedback surveys.
Read the event description below and design a feedback form tailored to it.

First, silently work out:
- PURPOSE: what the event aimed to achieve (learning a skill, competing, networking, celebrating, raising awareness...). Every event type needs different questions.
- AUDIENCE: who attended (students, professionals, teams, general public).
- ACTIVITIES: every session, talk, lab, game, competition or performance mentioned, by name.
- TECHNICAL DETAILS: every tool, technology, platform, venue, AV setup, app or online system mentioned, by name.
- LOGISTICS that were mentioned: registration, food, timing, venue, prizes, passes.

Then build the form in this order:
1. "About you" (2 questions max): a MULTIPLE_CHOICE or DROPDOWN about the respondent that makes feedback comparable - e.g. prior experience level for a learning event, role or year of study, team vs solo for a competition. Never ask for name, email or phone.
2. Purpose / outcome section - did the event achieve its PURPOSE for this person? This is the most important section.
   - Learning events: rate confidence BEFORE vs AFTER on the specific skills/technologies (two RATING questions), and "Which topics would you like to go deeper into?" as CHECKBOX listing the actual topics.
   - Competitions/hackathons: fairness of judging, clarity of problem statements/rules, quality of mentoring.
   - Cultural/social events: which events they attended (CHECKBOX of actual event names) and which was the highlight (MULTIPLE_CHOICE).
3. Activities - one question per named activity. Vary the angle instead of repeating "how would you rate X": usefulness, pace, difficulty, duration, engagement. Use a MULTIPLE_CHOICE like ["Too slow","Just right","Too fast"] or ["Too easy","Just right","Too hard"] for pace/difficulty where it fits.
4. Technical & logistics - for the tools/venue/platform mentioned, prefer ONE CHECKBOX "Did you face any of these issues?" listing concrete, specific problems (e.g. "Firebase setup errors", "Wi-Fi disconnections in Lab 3", "Couldn't see the projector screen", "None") instead of many Yes/No questions. Add at most 1-2 RATING questions here.
5. Overall: overall satisfaction (RATING 1-5); "How likely are you to recommend <event name> to a friend?" as RATING with scaleMin 0, scaleMax 10, lowLabel "Not at all likely", highLabel "Extremely likely"; "What did you like most?" (SHORT_TEXT); "What is one thing we should change next time?" (PARAGRAPH).

Rules:
- 12 to 16 questions in total, 4 to 5 sections. Mix question types - do not make most questions RATING.
- Use the specific names of activities, tools and places from the description in the questions and options. No generic placeholders.
- Questions must be short, neutral and not leading ("How useful was..." not "How great was...").
- Each question asks about ONE thing only.
- Avoid YES_NO unless the answer is truly binary. If you use YES_NO for a problem check, follow it with an optional SHORT_TEXT "If no, what went wrong?".
- RATING labels must match the question (e.g. "Not useful" / "Very useful", "Not confident" / "Very confident"), not always Poor/Excellent.
- Choice options must be specific, mutually exclusive where appropriate, and include "Other" or "None" when needed.
- Required: the about-you questions, outcome questions and overall satisfaction. Open text questions are optional.
- Allowed question types: RATING, MULTIPLE_CHOICE, CHECKBOX, DROPDOWN, YES_NO, SHORT_TEXT, PARAGRAPH.
- RATING uses scaleMin 1, scaleMax 5 unless stated otherwise above.
- MULTIPLE_CHOICE, CHECKBOX and DROPDOWN must have 2 to 7 options.
- The form "description" should thank attendees by event name and say it takes about 3 minutes.

Return ONLY JSON in exactly this shape:
{
  "title": "string - form title, e.g. '<Event name> - Feedback'",
  "description": "string - 1-2 friendly sentences shown at the top of the form",
  "eventType": "string - e.g. Workshop, Hackathon, Seminar, Cultural fest",
  "sections": [
    {
      "title": "string",
      "description": "string",
      "questions": [
        {
          "type": "RATING | MULTIPLE_CHOICE | CHECKBOX | DROPDOWN | YES_NO | SHORT_TEXT | PARAGRAPH",
          "title": "string",
          "helpText": "string (may be empty)",
          "required": true,
          "options": ["only for MULTIPLE_CHOICE / CHECKBOX / DROPDOWN"],
          "scaleMin": 1,
          "scaleMax": 5,
          "lowLabel": "only for RATING",
          "highLabel": "only for RATING"
        }
      ]
    }
  ]
}

EVENT DESCRIPTION:
"""${description}"""`;

  const payload = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.4 }
  });

  let response = null;
  let lastError = '';
  outer:
  for (let m = 0; m < MODELS.length; m++) {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + MODELS[m] + ':generateContent';
    for (let attempt = 1; attempt <= 2; attempt++) {
      const res = UrlFetchApp.fetch(url, {
        method: 'post',
        contentType: 'application/json',
        headers: { 'x-goog-api-key': key },
        payload: payload,
        muteHttpExceptions: true
      });
      const status = res.getResponseCode();
      if (status === 200) { response = res; break outer; }

      lastError = MODELS[m] + ' -> ' + status + ': ' + res.getContentText().slice(0, 200);
      Logger.log('Attempt failed: ' + lastError);
      if (status === 400 || status === 401 || status === 403) {
        throw new Error('AI request failed (' + status + '). Check your API key. ' + res.getContentText().slice(0, 200));
      }
      if (status === 404) break;          // model name not available, try next model
      Utilities.sleep(2000 * attempt);    // busy / rate-limited: wait, then retry
    }
  }
  if (!response) {
    throw new Error('All AI models are busy right now. Please try again in a minute. (' + lastError + ')');
  }

  const data = JSON.parse(response.getContentText());
  const candidate = data.candidates && data.candidates[0];
  const parts = candidate && candidate.content && candidate.content.parts;
  if (!parts || !parts.length) throw new Error('The AI returned an empty answer. Please try again.');

  let text = parts.map(function (p) { return p.text || ''; }).join('');
  text = text.replace(/^\s*```(?:json)?\s*/i, '').replace(/```\s*$/, '');

  let plan;
  try {
    plan = JSON.parse(text);
  } catch (e) {
    throw new Error('Could not read the AI answer as JSON. Please try again.');
  }
  if (!plan.sections || !plan.sections.length) {
    throw new Error('The AI did not return any questions. Try a more detailed description.');
  }
  return plan;
}

/** Step 2: turn the AI's plan into a real Google Form. */
function buildForm_(plan) {
  const formTitle = (plan.title && String(plan.title).trim()) || 'Event Feedback Form';
  const form = FormApp.create(formTitle); // this only names the file in Drive
  form.setTitle(formTitle);               // this sets the title shown on the form
  form.setDescription(plan.description || 'Thank you for attending! Please share your feedback.');
  form.setProgressBar(true);
  form.setConfirmationMessage('Thanks for your feedback! It helps us make the next event better.');

  let questionCount = 0;
  const summary = [];

  plan.sections.forEach(function (section, i) {
    const title = section.title || ('Section ' + (i + 1));
    const help = section.description || '';
    if (i === 0) {
      form.addSectionHeaderItem().setTitle(title).setHelpText(help);
    } else {
      form.addPageBreakItem().setTitle(title).setHelpText(help); // new page per section
    }

    const added = [];
    (section.questions || []).forEach(function (q) {
      const ok = addQuestion_(form, q);
      if (ok) {
        questionCount++;
        added.push({ title: q.title, type: ok });
      }
    });
    summary.push({ title: title, questions: added });
  });

  return {
    title: form.getTitle(),
    eventType: plan.eventType || '',
    questionCount: questionCount,
    formUrl: form.getPublishedUrl(), // share this with attendees
    editUrl: form.getEditUrl(),      // organiser can tweak the form here
    sections: summary
  };
}

/** Adds one question. Returns the type used, or false if skipped. */
function addQuestion_(form, q) {
  const title = String(q.title || '').trim();
  if (!title) return false;

  const options = Array.isArray(q.options)
    ? q.options.map(String).map(function (o) { return o.trim(); }).filter(Boolean)
    : [];
  let type = String(q.type || 'SHORT_TEXT').toUpperCase();

  // Choice questions without enough options fall back to a text answer.
  if (['MULTIPLE_CHOICE', 'CHECKBOX', 'DROPDOWN'].indexOf(type) !== -1 && options.length < 2) {
    type = 'SHORT_TEXT';
  }

  let item;
  switch (type) {
    case 'RATING': {
      const min = q.scaleMin === 0 ? 0 : 1;                           // Forms allows 0 or 1
      const max = Math.min(Math.max(Number(q.scaleMax) || 5, 3), 10); // Forms allows 3-10
      item = form.addScaleItem().setBounds(min, max)
        .setLabels(q.lowLabel || 'Poor', q.highLabel || 'Excellent');
      break;
    }
    case 'YES_NO':
      item = form.addMultipleChoiceItem().setChoiceValues(['Yes', 'No']);
      break;
    case 'MULTIPLE_CHOICE':
      item = form.addMultipleChoiceItem().setChoiceValues(options);
      break;
    case 'CHECKBOX':
      item = form.addCheckboxItem().setChoiceValues(options);
      break;
    case 'DROPDOWN':
      item = form.addListItem().setChoiceValues(options);
      break;
    case 'PARAGRAPH':
      item = form.addParagraphTextItem();
      break;
    default:
      type = 'SHORT_TEXT';
      item = form.addTextItem();
  }

  item.setTitle(title).setHelpText(q.helpText || '').setRequired(q.required === true);
  return type;
}

/** Run this once from the editor to grant permissions and test everything. */
function testGenerate() {
  const result = generateFeedbackForm(
    'TechSpark 2026 is a one-day hands-on workshop for second-year CSE students on building ' +
    'web apps with React and Firebase. Sessions: a morning talk on modern web development, ' +
    'a live coding lab where students build a to-do app in VS Code, a Firebase authentication ' +
    'demo, and a 1-hour mini hackathon with prizes. Held in Lab 3 with a projector and campus Wi-Fi.'
  );
  Logger.log(JSON.stringify(result, null, 2));
}