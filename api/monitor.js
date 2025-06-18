const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const sendgrid = require('@sendgrid/mail');

sendgrid.setApiKey(process.env.SENDGRID_API_KEY);

async function fetchProduct(url) {
  const res = await axios.get(url, { headers: {
    'User-Agent':'Mozilla/5.0',
    'Accept':'text/html'
  } });
  const $ = cheerio.load(res.data);
  return {
    title: $('h1.product-heading').text().trim(),
    price: $('.price').first().text().trim(),
    stock: $('.stock-status').first().text().trim(),
    url
  };
}

export default async function handler(req, res) {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname,'../config.json')));
  const oldPath = path.join(__dirname,'../data.json');
  const oldData = fs.existsSync(oldPath) ? JSON.parse(fs.readFileSync(oldPath)) : {};
  const newData = {};
  const changes = [];

  for (const url of config.urls) {
    try {
      const prod = await fetchProduct(url);
      newData[prod.title] = prod;
      const old = oldData[prod.title];
      if (!old) changes.push(`NYT: ${prod.title} – ${prod.price} – ${prod.stock}`);
      else {
        if (old.price !== prod.price) changes.push(`PRIS: ${prod.title} – ${old.price} → ${prod.price}`);
        if (old.stock !== prod.stock) changes.push(`LAGER: ${prod.title} – ${old.stock} → ${prod.stock}`);
      }
    } catch(e) { console.error('Fejl:', e.message); }
  }

  if (changes.length > 0) {
    fs.writeFileSync(oldPath, JSON.stringify(newData,null,2), 'utf8');
    const html = `<ul>${changes.map(c=>`<li>${c}</li>`).join('')}</ul>`;
    await sendgrid.send({
      to: config.emailTo,
      from: config.emailTo,
      subject: 'Dustin ændringer',
      html
    });
  }
  return res.status(200).send(`
    <h2>Dustin status</h2>
    ${ changes.length ? `<h3>Ændringer</h3><ul>${changes.map(c=>`<li>${c}</li>`).join('')}</ul>` : '<p>Ingen ændringer</p>'}
    <h3>Seneste status</h3>
    <pre>${JSON.stringify(newData, null, 2)}</pre>
  `);
}
