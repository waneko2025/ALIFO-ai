# ALIFO AI — Free Mode

ALIFO AI is a Japanese/English chat website that can be published without an OpenAI API key.

## Important

This version does **not** call a paid AI API. It uses built-in local responses, so there is no OpenAI API charge from this app.

It is a free/demo chatbot rather than a full large-language-model service. You can later replace the `/api/chat` implementation with a real AI provider if you decide to add API billing.

## Deploy to Render

1. Upload these project files to your GitHub repository.
2. In Render, connect the repository.
3. Build Command: `npm install`
4. Start Command: `npm start`
5. No API key or Environment Variables are required.
6. Deploy.

## Local run

```bash
npm install
npm start
```

Then open `http://localhost:3000`.
