<template>
  <div id="app">
    <!-- <img alt="Vue logo" src="./assets/pizza.png"> -->
    <PizzaHome msg="Arizmendi Pizza"/>
  </div>
</template>

<script>
import PizzaHome from './components/PizzaHome.vue'

export default {
  name: 'app',
  components: {
    PizzaHome
  }
}
</script>

<style>
#app {
  font-family: 'Avenir', Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
  margin-top: 60px;
}
</style>
