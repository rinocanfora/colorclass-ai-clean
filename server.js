import express from "express";
import dotenv from "dotenv";
import OpenAI from "openai";
import pkg from "whatsapp-web.js";
import qrcode from "qrcode-terminal";

const { Client, LocalAuth } = pkg;

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 4000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

let CHAT_MODE = "AI";
let HUMAN_OPERATOR = "";

const chatMemory = {};

const SYSTEM_PROMPT = `
Sei Eli, assistente virtuale di Color Class Parrucchieri.

Parla sempre in modo:
- professionale
- gentile
- semplice
- chiaro
- breve

Non parlare mai di altri parrucchieri.
Parla solo di Color Class Parrucchieri.

Informazioni corrette del salone:
- Nome: Color Class Parrucchieri
- Indirizzo: Via Masullo 53-E, Quarto (Napoli)
- Siamo nel polo commerciale
- Parcheggio gratuito davanti al salone

Regole:
- Non ripetere continuamente la presentazione.
- Se la cliente fa una domanda libera, rispondi in modo utile e corto.
- Se parla di prezzi, usa questi riferimenti:

PIEGA
- Piega Class: 19 €

TAGLIO
- Taglio d’Autore: 25 €

COLORE
- My Color: da 25 €
- Color Classic: da 35 €
- Color Care: da 40 €

SCHIARITURE
- Soft Light: da 70 €
- Plus Light: da 90 €
- Luxury Light: da 120 €

TRATTAMENTI
- Molecular Repair: 18 €
- Filler Therapy: 30 €
- Laminazione: 35 €

- Quando vedi "da", il prezzo preciso dipende da lunghezza e quantità dei capelli.
- Se la cliente vuole prenotare, invita sempre a scrivere il giorno preferito e il servizio.
- Se la cliente chiede dove siete, indica l’indirizzo e il parcheggio gratuito.
`;

const whatsappClient = new Client({
  authStrategy: new LocalAuth({
    clientId: "colorclass-ai",
  }),
  puppeteer: {
    executablePath: process.env.CHROME_BIN || undefined,
    headless: true,
    protocolTimeout: 120000,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
});

function normalizeInput(text) {
  if (!text) return "";
  return text
    .trim()
    .toLowerCase()
    .replaceAll("0️⃣", "0")
    .replaceAll("1️⃣", "1")
    .replaceAll("2️⃣", "2")
    .replaceAll("3️⃣", "3")
    .replaceAll("4️⃣", "4")
    .replaceAll("5️⃣", "5")
    .replaceAll("6️⃣", "6")
    .replaceAll("7️⃣", "7")
    .replaceAll("8️⃣", "8")
    .replaceAll("9️⃣", "9")
    .replace(/\s+/g, " ");
}

function isGreeting(text) {
  const t = normalizeInput(text);
  return ["ciao", "salve", "buongiorno", "buonasera", "hey", "ehi"].includes(t);
}

function isWorkingHours() {
  const now = new Date();
  const day = now.getDay(); // 0 dom, 1 lun, 2 mar ... 6 sab
  const hour = now.getHours();
  return day >= 2 && day <= 6 && hour >= 9 && hour < 19;
}

function mainMenu(withGreeting = false) {
  if (withGreeting) {
    return `Ciao 😊
sono Eli, assistente virtuale di Color Class Parrucchieri.

MENU PRINCIPALE

1 Prenotare un appuntamento
2 Vedere il listino prezzi
3 Schiariture e balayage
4 Trattamenti capelli
5 Dove si trova il salone

Rispondi con il numero per i dettagli.`;
  }

  return `MENU PRINCIPALE

1 Prenotare un appuntamento
2 Vedere il listino prezzi
3 Schiariture e balayage
4 Trattamenti capelli
5 Dove si trova il salone

Rispondi con il numero per i dettagli.`;
}

function bookingMenu() {
  return `PRENOTAZIONE APPUNTAMENTO

10 Prenotare colore
11 Prenotare schiariture
12 Prenotare taglio
13 Prenotare trattamento

0 Tornare al menu principale

Rispondi con il numero per i dettagli.`;
}

function listinoMenu() {
  return `LISTINO PREZZI

20 Colore
21 Schiariture
22 Taglio
23 Trattamenti

0 Tornare al menu principale

Rispondi con il numero per i dettagli.`;
}

function schiaritureMenu() {
  return `SCHIARITURE E BALAYAGE

30 Soft Light
31 Plus Light
32 Luxury Light

0 Tornare al menu principale

Rispondi con il numero per i dettagli.`;
}

function trattamentiMenu() {
  return `TRATTAMENTI CAPELLI

40 Molecular Repair
41 Filler Therapy
42 Laminazione

0 Tornare al menu principale

Rispondi con il numero per i dettagli.`;
}

function indirizzoMenu() {
  return `INDIRIZZO SALONE

Color Class Parrucchieri
Via Masullo 53-E
Quarto (Napoli)

Il salone si trova nel polo commerciale.
Davanti al salone trovi parcheggio gratuito.

1 Prenotare un appuntamento
0 Tornare al menu principale

Rispondi con il numero per i dettagli.`;
}

function prenotaServizio(servizio) {
  return `Perfetto 😊

Hai scelto: ${servizio}

Scrivimi ora il giorno in cui preferiresti venire.

Ti metteremo in contatto con un operatore del salone che verificherà la disponibilità e ti confermerà l'orario.`;
}

function dettaglioColore() {
  return `DETTAGLIO COLORE

Servizi colore disponibili:

My Color → da 25 €
Color Classic → da 35 €
Color Care → da 40 €

Il prezzo preciso dipende sempre da lunghezza e quantità dei capelli.

10 Prenotare colore
0 Tornare al menu principale

Rispondi con il numero per i dettagli.`;
}

function dettaglioTaglio() {
  return `DETTAGLIO TAGLIO

Taglio d’Autore → 25 €

12 Prenotare taglio
0 Tornare al menu principale

Rispondi con il numero per i dettagli.`;
}

function dettaglioSoftLight() {
  return `SOFT LIGHT

Soft Light è una schiaritura molto naturale.

Perfetta per chi desidera più luminosità senza stacchi evidenti.

Prezzo indicativo:
da 70 €

11 Prenotare schiariture
0 Tornare al menu principale

Rispondi con il numero per i dettagli.`;
}

function dettaglioPlusLight() {
  return `PLUS LIGHT

Plus Light è una schiaritura più luminosa e visibile.

Ideale per chi vuole un biondo più evidente ma sempre elegante.

Prezzo indicativo:
da 90 €

11 Prenotare schiariture
0 Tornare al menu principale

Rispondi con il numero per i dettagli.`;
}

function dettaglioLuxuryLight() {
  return `LUXURY LIGHT

Luxury Light è la nostra tecnica più avanzata.

Schiaritura personalizzata con radici perfettamente sfumate e punte luminose.

Prezzo indicativo:
da 120 €

11 Prenotare schiariture
0 Tornare al menu principale

Rispondi con il numero per i dettagli.`;
}

function dettaglioMolecular() {
  return `MOLECULAR REPAIR

Molecular Repair è un trattamento di ricostruzione profonda.

Ideale per capelli danneggiati, stressati o trattati chimicamente.

Prezzo indicativo:
18 €

13 Prenotare trattamento
0 Tornare al menu principale

Rispondi con il numero per i dettagli.`;
}

function dettaglioFiller() {
  return `FILLER THERAPY

Filler Therapy rinforza e riempie la fibra capillare.

Perfetto per capelli sottili o indeboliti.

Prezzo indicativo:
30 €

13 Prenotare trattamento
0 Tornare al menu principale

Rispondi con il numero per i dettagli.`;
}

function dettaglioLaminazione() {
  return `LAMINAZIONE

La laminazione dona lucentezza e protezione ai capelli.

Perfetta per rendere il capello più luminoso e disciplinato.

Prezzo indicativo:
35 €

13 Prenotare trattamento
0 Tornare al menu principale

Rispondi con il numero per i dettagli.`;
}

function workingHoursReply() {
  return `Grazie per averci contattato 💛

Ti metteremo in contatto con un operatore del salone il prima possibile.`;
}

whatsappClient.on("qr", (qr) => {
  console.log("QR CODE WHATSAPP:");
  qrcode.generate(qr, { small: true });
});

whatsappClient.on("ready", () => {
  console.log("WhatsApp collegato");
});

whatsappClient.on("disconnected", (reason) => {
  console.log("WhatsApp disconnesso:", reason);
});

whatsappClient.on("message", async (message) => {
  try {
    const testoOriginale = message.body?.trim() || "";
    const testo = normalizeInput(testoOriginale);

    if (!testo) return;

    if (CHAT_MODE === "HUMAN") {
      return;
    }

    const chat = await message.getChat();
    await chat.sendStateTyping();

    if (isWorkingHours()) {
      await message.reply(workingHoursReply());
      return;
    }

    const numeroCliente = message.from;
    const oggi = new Date().toISOString().slice(0, 10);
    const giaSalutatoOggi =
      chatMemory[numeroCliente] &&
      chatMemory[numeroCliente].lastGreetingDate === oggi;

    // MENU GESTITO DAL CODICE
    if (testo === "0") {
      await message.reply(mainMenu(false));
      return;
    }

    if (isGreeting(testo)) {
      await message.reply(mainMenu(!giaSalutatoOggi));
      chatMemory[numeroCliente] = { lastGreetingDate: oggi };
      return;
    }

    if (testo === "1") {
      await message.reply(bookingMenu());
      return;
    }

    if (testo === "2") {
      await message.reply(listinoMenu());
      return;
    }

    if (testo === "3") {
      await message.reply(schiaritureMenu());
      return;
    }

    if (testo === "4") {
      await message.reply(trattamentiMenu());
      return;
    }

    if (testo === "5") {
      await message.reply(indirizzoMenu());
      return;
    }

    if (testo === "10") {
      await message.reply(prenotaServizio("colore"));
      return;
    }

    if (testo === "11") {
      await message.reply(prenotaServizio("schiariture"));
      return;
    }

    if (testo === "12") {
      await message.reply(prenotaServizio("taglio"));
      return;
    }

    if (testo === "13") {
      await message.reply(prenotaServizio("trattamento"));
      return;
    }

    if (testo === "20") {
      await message.reply(dettaglioColore());
      return;
    }

    if (testo === "21") {
      await message.reply(schiaritureMenu());
      return;
    }

    if (testo === "22") {
      await message.reply(dettaglioTaglio());
      return;
    }

    if (testo === "23") {
      await message.reply(trattamentiMenu());
      return;
    }

    if (testo === "30") {
      await message.reply(dettaglioSoftLight());
      return;
    }

    if (testo === "31") {
      await message.reply(dettaglioPlusLight());
      return;
    }

    if (testo === "32") {
      await message.reply(dettaglioLuxuryLight());
      return;
    }

    if (testo === "40") {
      await message.reply(dettaglioMolecular());
      return;
    }

    if (testo === "41") {
      await message.reply(dettaglioFiller());
      return;
    }

    if (testo === "42") {
      await message.reply(dettaglioLaminazione());
      return;
    }

    // FALLBACK AI per testo libero fuori orario
    const introRule = giaSalutatoOggi
      ? "In questa chat ti sei già presentata oggi. Non ripresentarti."
      : "Se è il primo messaggio di oggi in questa chat, puoi presentarti come Eli, assistente virtuale di Color Class Parrucchieri.";

    const risposta = await openai.responses.create({
      model: "gpt-5-mini",
      input: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "system", content: introRule },
        { role: "user", content: testoOriginale },
      ],
    });

    const reply = risposta.output_text || "Ciao 😊 Scrivimi pure come posso aiutarti.";

    if (!giaSalutatoOggi) {
      chatMemory[numeroCliente] = {
        lastGreetingDate: oggi,
      };
    }

    await message.reply(reply);
  } catch (error) {
    console.log("ERRORE MESSAGGIO WHATSAPP:", error);
  }
});

app.get("/", (req, res) => {
  res.send("Color Class AI attiva");
});

app.get("/status", (req, res) => {
  res.json({
    mode: CHAT_MODE,
    operator: HUMAN_OPERATOR,
  });
});

app.get("/takeover", (req, res) => {
  CHAT_MODE = "HUMAN";
  HUMAN_OPERATOR = "Rino";
  res.json({
    mode: CHAT_MODE,
    operator: HUMAN_OPERATOR,
  });
});

app.get("/release", (req, res) => {
  CHAT_MODE = "AI";
  HUMAN_OPERATOR = "";
  res.json({
    mode: CHAT_MODE,
    operator: HUMAN_OPERATOR,
  });
});

app.get("/ask", async (req, res) => {
  try {
    const domanda = req.query.q || "ciao";

    if (CHAT_MODE === "HUMAN") {
      return res.json({
        reply: "Chat in gestione umana",
        mode: CHAT_MODE,
        operator: HUMAN_OPERATOR,
      });
    }

    const risposta = await openai.responses.create({
      model: "gpt-5-mini",
      input: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: domanda },
      ],
    });

    res.send(risposta.output_text || "Ciao! Come posso aiutarti?");
  } catch (error) {
    console.log("ERRORE /ask:", error);
    res.status(500).send("Errore OpenAI");
  }
});

app.listen(PORT, () => {
  console.log("Server avviato sulla porta " + PORT);
});

whatsappClient.initialize();
