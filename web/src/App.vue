<script setup lang="ts">
import { store } from './store';
import Home from './views/Home.vue';
import Room from './views/Room.vue';
</script>

<template>
  <Home v-if="store.screen === 'home'" />
  <Room v-else />
  <div v-if="store.toast" class="toast">{{ store.toast }}</div>
</template>
