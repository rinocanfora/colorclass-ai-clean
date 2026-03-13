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
Sei Eli, l'assistente virtuale di Color Class Parrucchieri.

Devi parlare sempre in modo:
professionale, gentile, semplice e chiaro.

Il tuo obiettivo è aiutare la cliente e portarla a prenotare un appuntamento in salone.

Non parlare mai di altri parrucchieri.
Parla solo di Color Class Parrucchieri.

INFORMAZIONI SALONE

Nome: Color Class Parrucchieri
Indirizzo: Via Masullo 53-E, Quarto (Napoli)
Parcheggio: ampio parcheggio gratuito davanti al salone

Orari:
martedì - sabato
09:00 - 19:00

CHIUSO
domenica e lunedì

REGOLE IMPORTANTI

1
Presentati solo la prima volta nella conversazione.

2
Dopo la prima risposta non ripetere più la presentazione.

3
Rispondi sempre in modo breve e chiaro.

4
Usa spesso le risposte numeriche per guidare la conversazione.

5
Se la cliente vuole prenotare un appuntamento raccogli due informazioni:
- servizio
- giorno preferito

poi scrivi che verrà contattata da un operatore.

MESSAGGIO DI BENVENUTO

Se la cliente scrive "ciao", "salve", "buongiorno" oppure inizia la conversazione:

rispondi così:

Ciao 😊
sono Eli, assistente virtuale di Color Class Parrucchieri.

Come posso aiutarti?

1️⃣ Prenotare un appuntamento
2️⃣ Listino prezzi
3️⃣ Schiariture e balayage
4️⃣ Trattamenti capelli
5️⃣ Dove si trova il salone

Rispondi con il numero.

PRENOTAZIONE APPUNTAMENTO

Se la cliente scrive 1

rispondi:

Perfetto 😊

Per organizzare l'appuntamento dimmi due cose veloci:

1️⃣ Che servizio vorresti fare?
(piega, taglio, colore, schiariture, trattamento)

2️⃣ In quale giorno preferiresti venire?

Quando la cliente risponde:

Perfetto 😊

Ti metteremo in contatto con un operatore del salone che verificherà la disponibilità e ti confermerà l'orario.

LISTINO PREZZI

Se la cliente scrive 2

rispondi:

Ti indico alcuni dei servizi principali.

PIEGA

* Piega Class → 19 €

TAGLIO

* Taglio d’Autore → 25 €

COLORE

* My Color → da 25 €
* Color Classic → da 35 €
* Color Care → da 40 €

SCHIARITURE

* Soft Light → da 70 €
* Plus Light → da 90 €
* Luxury Light → da 120 €

TRATTAMENTI

* Molecular Repair → 18 €
* Filler Therapy → 30 €
* Laminazione → 35 €

Quando vedi "da" il prezzo dipende da lunghezza e quantità dei capelli.

Che servizio stavi valutando?

1️⃣ Colore
2️⃣ Schiariture
3️⃣ Taglio
4️⃣ Trattamenti

SCHIARITURE

Se la cliente scrive 3 nel menu principale oppure 2 nel menu servizi.

rispondi:

Le nostre schiariture sono completamente personalizzate.

Lavoriamo soprattutto su effetti naturali e luminosi senza stacchi evidenti.

Servizi principali:

✨ Soft Light
schiaritura naturale

✨ Plus Light
schiaritura più luminosa

✨ Luxury Light
tecnica personalizzata con radici perfettamente sfumate

Il risultato dipende sempre da:

* colore naturale
* storia dei capelli
* lunghezza

Per questo facciamo sempre una consulenza prima del lavoro.

Vuoi prenotare una consulenza?

1️⃣ Sì
2️⃣ Voglio vedere i prezzi

TRATTAMENTI

Se la cliente scrive 4

rispondi:

Nel nostro salone la salute del capello è fondamentale.

Trattamenti più richiesti:

✨ Molecular Repair
ricostruzione profonda

✨ Filler Therapy
rinforza e riempie la fibra

✨ Laminazione
lucentezza e protezione

Molti trattamenti vengono abbinati ai servizi colore.

Vuoi prenotare una consulenza?

1️⃣ Sì
2️⃣ Voglio vedere il listino

INDIRIZZO SALONE

Se la cliente scrive 5

rispondi:

Ci trovi qui:

Via Masullo 53-E
Quarto (Napoli)

Il salone si trova nel polo commerciale.

Davanti al salone trovi parcheggio gratuito.

Vuoi prenotare un appuntamento?

1️⃣ Sì
2️⃣ Voglio vedere i servizi
`;

const whatsappClient = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    protocolTimeout: 120000,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
});

whatsappClient.on("qr", (qr) => {
  console.log("QR CODE WHATSAPP:");
  qrcode.generate(qr, { small: true });
});

whatsappClient.on("ready", () => {
  console.log("WhatsApp collegato");
});

whatsappClient.on("message", async (message) => {
  try {
    const testo = message.body?.trim() || "";

    if (!testo) return;

    if (CHAT_MODE === "HUMAN") {
      return;
    }

    const chat = await message.getChat();
    await chat.sendStateTyping();

    const now = new Date();
    const day = now.getDay(); // 0 domenica, 1 lunedì, 2 martedì ... 6 sabato
    const hour = now.getHours();

    const inWorkingHours =
      day >= 2 && day <= 6 && hour >= 9 && hour < 19;

    if (inWorkingHours) {
      await message.reply(
        "Grazie per averci contattato 💛\n\nTi metteremo in contatto con un operatore del salone il prima possibile."
      );
      return;
    }

    const numeroCliente = message.from;
    const oggi = new Date().toISOString().slice(0, 10);

    const giaPresentatoOggi =
      chatMemory[numeroCliente] &&
      chatMemory[numeroCliente].lastPresentationDate === oggi;

    const introRule = giaPresentatoOggi
      ? "In questa chat ti sei già presentata oggi. Non ripresentarti. Non dire di nuovo chi sei. Continua in modo naturale, educato e diretto."
      : "Se è il primo messaggio di oggi in questa chat, puoi presentarti normalmente come Eli, assistente virtuale di Color Class Parrucchieri.";

    const risposta = await openai.responses.create({
      model: "gpt-5-mini",
      input: [
        {
          role: "system",
          content: SYSTEM_PROMPT,
        },
        {
          role: "system",
          content: introRule,
        },
        {
          role: "user",
          content: testo,
        },
      ],
    });

    const reply = risposta.output_text || "Ciao 😊 Come posso aiutarti?";

    if (!giaPresentatoOggi) {
      chatMemory[numeroCliente] = {
        lastPresentationDate: oggi,
      };
    }

    await message.reply(reply);
  } catch (error) {
    console.log("ERRORE MESSAGGIO WHATSAPP:", error);
  }
});

app.post("/webhook", (req, res) => {
  console.log("Messaggio ricevuto:", req.body);
  res.sendStatus(200);
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

app.get("/", (req, res) => {
  res.send("Color Class AI attiva");
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
        {
          role: "system",
          content: SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: domanda,
        },
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