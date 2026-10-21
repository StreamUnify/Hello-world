[README.md](https://github.com/user-attachments/files/33746674/README.md)
# StreamUnify — Render-ready deployment files

Upload all files in this directory to the ROOT of your GitHub repository (not a nested folder):
- index.html
- server.mjs
- package.json
- render.yaml (optional Render blueprint configuration)

Render Web Service settings:
- Runtime: Node
- Root directory: blank
- Build command: npm install
- Start command: npm start
- Environment: TMDB_API_KEY = your newly regenerated TMDB API key

Then choose Manual Deploy -> Deploy latest commit.

If you uploaded the files inside a subfolder, set Render's Root Directory to that subfolder instead.

Keep TMDB credentials only in Render environment variables, never in GitHub files.

This is a prototype. It has no provider account synchronization or native apps yet. Review TMDB commercial licensing before launching commercially.
