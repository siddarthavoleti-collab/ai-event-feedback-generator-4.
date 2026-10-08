# AI Event Feedback Form Generator

Google Apps Script project that takes an event description, uses Gemini to design a customized feedback questionnaire, and builds a real Google Form.

## Project files

- `Code.gs` — Apps Script backend, Gemini API call, JSON validation, and Google Form creation.
- `Index.html` — Web-app UI for entering the event description and viewing the generated form.
- `appsscript.json` — Apps Script project manifest.

## Setup

1. Create/open a Google Apps Script project.
2. Add/replace the three project files with:
   - `Code.gs`
   - `Index.html`
   - `appsscript.json`
3. In Apps Script, open **Project Settings → Script Properties**.
4. Add a script property:
   - **Property:** `GEMINI_API_KEY`
   - **Value:** your Gemini API key
5. Deploy the project as a web app.
6. Open the deployed web-app URL and enter an event description.

The API key is intentionally not included in this folder. The code reads it from Apps Script Script Properties.

## Main flow

Event description → Gemini analyzes the event → structured feedback questions → Google Forms API/FormApp builds the form → share/edit links are displayed.

## Notes

The source project is based directly on the uploaded Google AI Studio / Apps Script export. No API key is hard-coded into the repository.
