# ALIFO AI

ALIFO AI is a small public demo web app with:

- Japanese / English UI
- browser-side chat history
- built-in rule-based smart chat mode (no OpenAI API key)
- image generation through the Pollinations image URL service
- image history, open and save controls
- mobile-friendly layout
- basic security headers and lightweight rate limiting

## Important image-service note

The image feature currently uses the Pollinations image URL service. Service availability, limits, models, and authentication requirements can change. ALIFO AI does not guarantee that image generation will remain anonymous or free forever.

Image prompts are sent to the external image service. Do not enter passwords, API keys, or unnecessary private information into image prompts.

## Render

- Build command: `npm install`
- Start command: `npm start`
- Branch: `main`

No OpenAI API key is required by this version.
