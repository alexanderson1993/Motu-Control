const fs = require("fs").promises;
const express = require("express");
const app = express();
const port = 6000;

const clients = {};

app.get("/datastore", async (req, res) => {
  const { client } = req.query;
  clients[client] = clients[client] ? clients[client] + 1 : 1;
  const data = await fs.readFile("./motu.json", "utf8");
  if (req.headers["if-none-match"])
    await new Promise(resolve => setTimeout(resolve, 15 * 1000));
  console.log("sending data");
  res.setHeader("content-type", "application/json");
  res.setHeader("ETag", clients[client]);
  res.send(data);
});

app.patch("/datastore", async (req, res) => {
  res.send(JSON.stringify({ ok: true }));
});
app.listen(port, () => console.log(`Example app listening on port ${port}!`));
