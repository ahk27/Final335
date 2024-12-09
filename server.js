require('dotenv').config();
const axios = require('axios');
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const path = require('path');
const { body, validationResult } = require('express-validator');

const app = express();
const Quarterback = require('./models/qbModel');

const dbURI = `mongodb+srv://${process.env.MONGO_DB_USERNAME}:${process.env.MONGO_DB_PASSWORD}@${process.env.MONGO_DB_CLUSTER}.0ebpm.mongodb.net/${process.env.MONGO_DB_NAME}?retryWrites=true&w=majority`;

mongoose
  .connect(dbURI)
  .then(() => console.log('Connected to MongoDB successfully!'))
  .catch(err => console.error('Error connecting to MongoDB:', err));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'templates'));

app.get('/', (req, res) => res.render('index'));

app.get('/addQB', (req, res) => res.render('addQB'));

app.post(
  '/addQB',
  [
    body('name').notEmpty().withMessage('Name is required'),
    body('team').notEmpty().withMessage('Team is required'),
    body('touchdowns').isNumeric().withMessage('Touchdowns must be a number'),
    body('interceptions').isNumeric().withMessage('Interceptions must be a number'),
    body('qbr').isFloat().withMessage('QBR must be a number'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    try {
      const { name, team, touchdowns, interceptions, qbr } = req.body;
      const qb = new Quarterback({ name, team, touchdowns, interceptions, qbr });
      await qb.save();
      res.redirect('/viewQBs');
    } catch (err) {
      res.status(500).send('Error adding quarterback.');
    }
  }
);

app.get('/viewQBs', async (req, res) => {
  try {
    const qbs = await Quarterback.find();
    res.render('viewQBs', { qbs });
  } catch (err) {
    res.status(500).send('Error retrieving quarterbacks.');
  }
});

app.get('/searchQB', (req, res) => res.render('searchQB'));

app.post('/searchQB', async (req, res) => {
  const { name } = req.body;
  try {
    let qb = await Quarterback.findOne({ name: new RegExp(name, 'i') });
    if (!qb) {
      const apiKey = process.env.SPORTS_API_KEY;
      const apiUrl = `https://api.sportsdata.io/v3/nfl/stats/json/Players?key=${apiKey}`;
      const response = await axios.get(apiUrl);
      const apiQB = response.data.find(player => player.Position === 'QB' && player.Name.toLowerCase().includes(name.toLowerCase()));
      if (apiQB) {
        qb = {
          name: apiQB.Name,
          team: apiQB.Team,
          touchdowns: apiQB.PassingTouchdowns || 'N/A',
          interceptions: apiQB.Interceptions || 'N/A',
          qbr: apiQB.QuarterbackRating || 'N/A',
        };
      }
    }
    if (qb) {
      res.render('stats', { qb });
    } else {
      res.send('Quarterback not found.');
    }
  } catch (err) {
    res.status(500).send('An error occurred while searching for the quarterback.');
  }
});

app.get(['/teamStats', '/teamStats/:season/:team'], async (req, res) => {
  let season, team;
  if (req.params.season && req.params.team) {
    season = req.params.season;
    team = req.params.team;
  } else if (req.query.season && req.query.team) {
    season = req.query.season;
    team = req.query.team;
  } else {
    return res.status(400).send('Please provide both season and team.');
  }
  const apiKey = process.env.SPORTS_API_KEY;
  const apiUrl = `https://api.sportsdata.io/v3/nfl/stats/json/PlayerSeasonStatsByTeam/${season}/${team}?key=${apiKey}`;
  try {
    const response = await axios.get(apiUrl);
    const qbs = response.data.filter(player => player.Position === 'QB');
    for (const qbData of qbs) {
      await Quarterback.findOneAndUpdate(
        { name: qbData.Name },
        {
          name: qbData.Name,
          team: qbData.Team,
          touchdowns: qbData.PassingTouchdowns,
          interceptions: qbData.Interceptions,
          qbr: qbData.QuarterbackRating,
        },
        { upsert: true, new: true }
      );
    }
    const savedQBs = await Quarterback.find({ team });
    res.render('teamStats', { qbs: savedQBs, team, season });
  } catch (err) {
    res.status(500).send('Error fetching QB stats from the API.');
  }
});

const fetchAndUpdateQBs = async (season, team) => {
  const apiKey = process.env.SPORTS_API_KEY;
  const apiUrl = `https://api.sportsdata.io/v3/nfl/stats/json/PlayerSeasonStatsByTeam/${season}/${team}?key=${apiKey}`;
  try {
    const response = await axios.get(apiUrl);
    const qbs = response.data.filter(player => player.Position === 'QB');
    for (const qbData of qbs) {
      await Quarterback.findOneAndUpdate(
        { name: qbData.Name },
        {
          name: qbData.Name,
          team: qbData.Team,
          touchdowns: qbData.PassingTouchdowns,
          interceptions: qbData.Interceptions,
          qbr: qbData.QuarterbackRating,
        },
        { upsert: true, new: true }
      );
    }
  } catch (err) {
    throw err;
  }
};

app.get('/admin/fetchQBs', async (req, res) => {
  try {
    const { season, team } = req.query;
    if (!season || !team) {
      return res.status(400).send('Please provide both season and team.');
    }
    await fetchAndUpdateQBs(season, team);
    res.send('QB data fetched and updated successfully.');
  } catch (err) {
    res.status(500).send('Error fetching QB data.');
  }
});

app.get('/deleteQBs', (req, res) => res.render('deleteQBs'));

app.post('/deleteQBs', async (req, res) => {
  try {
    const result = await Quarterback.deleteMany({});
    res.render('deleteSuccess', { deletedCount: result.deletedCount });
  } catch (error) {
    res.status(500).send('Error deleting NFL QB data.');
  }
});

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
process.stdin.resume();
process.stdin.setEncoding('utf8');
process.stdin.on('data', input => {
  if (input.trim().toLowerCase() === 'stop') {
    server.close(() => process.exit(0));
  }
});
