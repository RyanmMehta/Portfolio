# Portfolio

Personal site for Ryan Mehta. Plain HTML, CSS and JavaScript with no build step; the globe uses [three.js](https://threejs.org) from a CDN.

## Run locally

The page uses ES modules, so it needs to be served rather than opened as a file:

```bash
python3 -m http.server 5173
```

Then open http://localhost:5173.

## Where things live

- `index.html` – name, introduction and section links
- `styles.css` – layout, type and the text entrance animation
- `js/globe.js` – the globe: lighting, opening turn, drag interaction. Tunable values (resting longitude, sun direction, spin speed, size of the opening turn) are at the top of the file.
- `js/stars.js` – the star field

Earth imagery is NASA's Blue Marble and Black Marble, loaded from the `three-globe` package on jsDelivr.
