const express = require("express");
const app = express();
const bodyParser = require('body-parser');
const http = require('http');
const server = http.Server(app);
const request = require('request');
const moment = require('moment');
const mongoose = require('mongoose');
const isProduction = process.env.NODE_ENV === 'production';
const util = require('./server/util/util.js');
const Pizza = require('./server/models/pizza.js');
const IngredientStatistic = require('./server/models/ingredient_statistic.js');
const Ingredient = require('./server/models/ingredient.js');

// config
app.set("port", process.env.PORT || 3000);
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// connect mongodb
const dbUri =  process.env.MONGODB_URI || 'mongodb://localhost/arizmendi';
mongoose.connect(dbUri, {useNewUrlParser: true});

// set up the MongoDB schema stuff
const db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', () => {
  console.log("Connected to mondoDB")
});

// serve static assets in production - otherwise client server handles asset serving
if (isProduction) {
  app.use(express.static(__dirname + "/client/dist"));
}

// routes

// GET is a little weird because we proxy a request to the squarespace
// Arizmendi site. Since we don't want to bombard them with requests
// every time someone requests our page, we save the pizza data
// in our own MongoDB instance so that we can use that for future requests.
// So while this is a GET for the client, we post data to our db for later use.
const dayOptions = new Set(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]);
app.get('/api/pizza/', (req, res) => {
  const {start, end} = req.query;

  // you gotta send me the date strings!
  if (!start || !end) {
    return res.sendStatus(400);
  }

  // validate start/end
  if (!dayOptions.has(start.split(" ")[0]) || !dayOptions.has(end.split(" ")[0])) {
    console.log("Bad start/end date");
    return res.sendStatus(400);
  }

  // first, check whether it's in our db
  Pizza.find({dateStr: start}, function (err, pizzas) {
    if (err) {
      console.log("Error finding record.");
      return;
    }

    if (pizzas.length > 1) {
      console.log("Found multiple records!");
      return res.json({cached: true, data: pizzas[0].ingredientsRawString});
    } else if (pizzas.length === 1) {
      return res.json({cached: true, data: pizzas[0].ingredientsRawString});
    } else {
      // make a proxy request. We just grab the entire HTML page
      // and parse the result.
      const options = {
        url: 'http://arizmendi-valencia.squarespace.com/pizza/',
        headers: {
          'User-Agent': 'request' // user-agent is required by squarespace
        }
      };

      request(options, (err, response, body) => {
        if (err) {
          return res.sendStatus(500);
        }

        if (response && response.statusCode !== 200) {
          return res.sendStatus(500);
        }

        const {targetSubstr, error} = util.parseHtml(body, start, end);
        if (error !== null) {
          return res.sendStatus(parseErr);
        }

        // if we got here without issue, we'll save the data in our db
        const momentDate = moment(start, 'dddd MMM D, YYYY').utc();
        const pizza = new Pizza({
          date: momentDate.toDate(),
          dateStr: start,
          ingredientsRawString: targetSubstr,
          ingredients: targetSubstr.toLowerCase().split(", ")
        });
        pizza.save(function (err, pizza) {
          if (err) {
            console.log("Could not save pizza!");
            return;
          }
          console.log("Saved pizza");
        });

        targetSubstr.toLowerCase().split(", ").forEach(ingredientStr => {
          // save pizza ingredient statistic
          let ingredientStatistic;
          IngredientStatistic.find({ingredient: ingredientStr}, (err, ingredients) => {
            if (err) {
              console.log("Error finding ingredientStatistic!");
              return;
            }
            if (ingredients.length === 1) {
              ingredientStatistic = ingredients[0];
            } else {
              ingredientStatistic = new IngredientStatistic({
                ingredient: ingredientStr,
                count: 0,
                percentage: 0
              });
            }
            ingredientStatistic.count += 1;
            let totalPizzaCount = 0;
            Pizza.countDocuments()
            .then(count => {
              totalPizzaCount = count;
              if (totalPizzaCount > 0) {
                ingredientStatistic.percentage = ingredientStatistic.count / totalPizzaCount;
              }
            })
            .then(() => {
              return ingredientStatistic.save()
            })
            .then(stat => {
              console.log("Saved ingredientStatistic");
            })
            .catch(err => {
              console.log("Could not save ingredientStatistic!");
            });


            // save ingredient to daily table (always create a new record)
            const ingredient = new Ingredient({
              date: momentDate.toDate(),
              name: ingredientStr
            });
            ingredient.save(function (err, ingredient) {
              if (err) {
                console.log("Could not save ingredient!");
                return;
              }
              console.log("Saved ingredient");
            });
          });
        });

        res.json({cached: false, data: targetSubstr});
      });
    }
  });
});

app.get('/api/pizza_statistics/', (req, res) => {
  let {ingredients} = req.query;
  ingredients = ingredients.split(", ");
  ingredients.forEach((ingredient, i) => {
    ingredients[i] = ingredient.toLowerCase();
  });
  IngredientStatistic.find({ingredient: ingredients}, function (err, ingredientStatistics) {
    res.json(ingredientStatistics);
  });
});

server.listen(app.get("port"), () => {
  console.log(`Find the server at: http://localhost:${app.get("port")}/`);
});
