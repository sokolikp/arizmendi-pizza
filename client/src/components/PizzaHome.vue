<template>
  <div>
    <h1>{{ msg }}</h1>
    <div v-if="noPizzaToday">
      Oh no, it's Tuesday! There's no pizza today.
    </div>
    <div v-if="!noPizzaToday">
      <h2>Today's pizza is:</h2>
      <p>
        {{ pizzaStr }}
      </p>
      <h4>How common is this pizza?</h4>
      <h5>(these ingredients appear with the following regularity)</h5>
      <p v-for="statistic in pizzaStatistics" :key="statistic._id">
        {{ statistic.ingredient }}: {{ Math.round(statistic.percentage * 100) }}%
      </p>
    </div>
  </div>
</template>

<script>
var moment = require('moment');
export default {
  name: 'PizzaHome',
  props: {
    msg: String
  },
  data: function () {
    return {
      pizzaStr: "",
      noPizzaToday: false,
      cached: false,
      pizzaStatistics: null
    }
  },
  mounted () {
    // calculate query params
    const now = moment();
    const dayName = now.format('dddd');
    const dayNumber = now.format('D');
    const month = now.format('MMMM');
    const year = now.format('YYYY');

    // there's never pizza on Tuesday!
    if (dayName === 'Tuesday') {
      this.noPizzaToday = true;
      this.pizzaStr = "";
    } else {
      // tomorrow is only calculated to help the backend know when
      // to "stop" its string parsing.
      const tomorrow = moment().add(1, 'd');
      const tomorrowDayName = tomorrow.format('dddd');
      const tomorrowDayNumber = tomorrow.format('D');
      const tomorrowMonth = tomorrow.format('MMMM');
      const tomorrowYear = tomorrow.format('YYYY');

      const fullDate = dayName + " " + month + " " + dayNumber + ", " + year;
      const tomorrowFullDate = tomorrowDayName + " " + tomorrowMonth + " " +
              tomorrowDayNumber + ", " + tomorrowYear;

      // request today's pizza
      fetch('/api/pizza?start=' + fullDate + '&end=' + tomorrowFullDate)
        .then(response => {
          return response.json();
        })
        .then(response => {
          this.cached = response.cached;
          this.pizzaStr = response.data;
          if (this.cached) {
            console.log("Lookup was cached");
          } else {
            console.log("Lookup not cached");
          }

          return fetch('/api/pizza_statistics?ingredients=' + this.pizzaStr)
            .then(response => {
              return response.json();
            })
            .then(response => {
              this.pizzaStatistics = response;
            });
        })
        .catch(err => {
          console.log(err);
        });
    }

  }
}
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
h3 {
  margin: 40px 0 0;
}
ul {
  list-style-type: none;
  padding: 0;
}
li {
  display: inline-block;
  margin: 0 10px;
}
a {
  color: #42b983;
}
</style>
