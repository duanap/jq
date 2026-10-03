<script setup lang="ts">
import { watch } from 'vue';
import { store, createRoom, joinRoom } from '../store';

// 房码输入自动转大写
watch(
  () => store.joinCode,
  (v) => {
    const up = v.toUpperCase();
    if (up !== v) store.joinCode = up;
  },
);
const codeOk = () => /^[A-Z2-9]{6}$/.test(store.joinCode.trim());
</script>

<template>
  <div class="home">
    <div class="logo">
      <div class="disc">帥</div>
      <h1>揭棋</h1>
    </div>
    <p class="sub">暗子藏局 · 落子揭真身 · 联机对弈</p>

    <div class="panel">
      <label>昵称</label>
      <input
        v-model="store.nick"
        maxlength="12"
        autocomplete="off"
        placeholder="给自己起个名字"
        @keyup.enter="store.joinCode ? joinRoom() : createRoom()"
      />
      <label>房码(加入时填写,留空则创建新局)</label>
      <input
        v-model="store.joinCode"
        maxlength="6"
        class="code"
        autocomplete="off"
        autocapitalize="characters"
        spellcheck="false"
        placeholder="6 位房码"
        @keyup.enter="codeOk() && joinRoom()"
      />
      <div class="btns">
        <button class="primary" @click="createRoom">创建房间</button>
        <button :disabled="!codeOk()" @click="joinRoom">加入房间</button>
      </div>
      <p class="tip">创建后把邀请链接发给对方,对方打开即同局对战</p>
      <div class="connline">
        <i class="dot" :class="store.connected ? 'ok' : ''"></i>
        {{ store.connected ? '已连接服务器' : '连接服务器中…' }}
      </div>
    </div>

    <details class="rules">
      <summary>玩法速览</summary>
      <ul>
        <li>帅/将明置原位,双方其余 15 子随机暗置于本方原位。</li>
        <li>暗子按所在位置的兵种走法行动,走动或吃子时翻开,从此按真实身份行动。</li>
        <li>翻开的士可以出九宫,翻开的象可以过河。</li>
        <li>将死或困毙对方获胜;长将判负;60 回合无吃子、三次重复局面判和。</li>
      </ul>
    </details>
  </div>
</template>

<style scoped>
.home {
  width: min(94vw, 420px);
  min-height: 100vh;
  min-height: 100dvh;
  padding: 24px 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 14px;
}
.logo {
  display: flex;
  align-items: center;
  gap: 14px;
}
.disc {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'KaiTi', 'STKaiti', serif;
  font-size: 30px;
  font-weight: 700;
  color: #b03024;
  background: radial-gradient(circle at 35% 30%, #fdf7e7, #f1e0b7 62%, #d8bf8a);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.4);
}
h1 {
  font-size: 34px;
  letter-spacing: 6px;
}
.sub {
  color: #9aa5b8;
  font-size: 13px;
  letter-spacing: 2px;
}
.panel {
  width: 100%;
  margin-top: 18px;
  background: #1d2432;
  border: 1px solid #2a3346;
  border-radius: 14px;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.panel label {
  font-size: 12px;
  color: #8a94a8;
  margin-top: 6px;
}
.btns {
  display: flex;
  gap: 10px;
  margin-top: 10px;
}
.btns button {
  flex: 1;
}
.tip {
  margin-top: 10px;
  font-size: 12px;
  color: #8a94a8;
  text-align: center;
}
.connline {
  margin-top: 10px;
  font-size: 12px;
  color: #8a94a8;
  display: flex;
  align-items: center;
}
.rules {
  width: 100%;
  font-size: 13px;
  color: #9aa5b8;
}
.rules summary {
  cursor: pointer;
  padding: 6px 0;
}
.rules ul {
  padding: 8px 0 0 18px;
  line-height: 1.9;
}
</style>
