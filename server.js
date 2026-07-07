// Startup-fil til cPanel's "Setup Node.js App" (Phusion Passenger).
// Passenger kører denne fil og forventer at appen lytter på process.env.PORT
// — det gør "next start" ikke direkte, når den startes via en almindelig
// npm-kommando, så vi starter Next.js programmatisk her i stedet.
//
// Kræver at "npm run build" er kørt én gang forinden (opretter .next-mappen).

const next = require("next");

const port = parseInt(process.env.PORT, 10) || 3000;
const app = next({ dev: false });
const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    require("http")
      .createServer((req, res) => handle(req, res))
      .listen(port, () => {
        console.log(`Pepo klar på port ${port}`);
      });
  })
  .catch((err) => {
    console.error("Kunne ikke starte Next.js:", err);
    process.exit(1);
  });
