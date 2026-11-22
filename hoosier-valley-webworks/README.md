# Hoosier Valley Webworks

Hoosier Valley Webworks is a services website operated by StreamUnify LLC. Its published files are in `public/`.

## Preview locally

Run this from the repository root, then open `http://localhost:8080`.

```sh
python3 -m http.server 8080 --directory hoosier-valley-webworks/public
```

## Deploy on Render

Create a separate Blueprint in the Render workspace that hosts StreamUnify. Connect `StreamUnify/Hello-world` and set **Blueprint Path** to `hoosier-valley-webworks/render.yaml`. Select the branch that will serve the site. The Blueprint creates one static service that publishes `hoosier-valley-webworks/public`.

Use the Render URL to review the site before connecting a custom domain.

The project form downloads a text brief in the visitor’s browser. When a business email is ready, add an `inquiry-email` meta tag to `public/index.html` to open an addressed draft in the visitor’s mail app.
