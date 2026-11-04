<template>
  <span class="lq-person-avatar" :class="{'lq-brand-avatar': brandSrc && loaded}" :data-tone="tone" :style="sizeStyle" aria-hidden="true">
    <img v-if="brandSrc" v-show="loaded" :src="brandSrc" alt="" referrerpolicy="no-referrer" @load="loaded = true" @error="loaded = false"/>
    <svg v-if="!brandSrc || !loaded" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="8" r="4"/>
      <path d="M5 21v-2a7 7 0 0 1 14 0v2"/>
    </svg>
  </span>
</template>

<script setup>
// LanQin 主题的发件人头像：常见品牌用本地图标，其他按地址算一个柔和底色。不会请求任何外部头像服务。
import {computed, ref, watch} from 'vue'

const props = defineProps({
  email: {type: String, default: ''},
  name: {type: String, default: ''},
  size: {type: Number, default: 36}
})

const BRANDS = {
  'tiktok.com': 'tiktok.svg', 'tiktokshop.com': 'tiktok.svg',
  'outlook.com': 'outlook.ico', 'hotmail.com': 'outlook.ico', 'live.com': 'outlook.ico',
  'gmail.com': 'gmail.ico', 'google.com': 'google.svg',
  'apple.com': 'apple.svg', 'icloud.com': 'apple.svg',
  'qq.com': 'qq.ico', 'foxmail.com': 'qq.ico', 'paypal.com': 'paypal.ico'
}

const loaded = ref(false)

const brandSrc = computed(() => {
  const email = String(props.email || '').toLowerCase()
  if (!email.includes('@')) return ''
  const domain = email.split('@').pop()
  const base = Object.keys(BRANDS).find(b => domain === b || domain.endsWith('.' + b))
  return base ? `/avatars/${BRANDS[base]}` : ''
})

watch(brandSrc, () => { loaded.value = false })

const tone = computed(() => {
  const key = String(props.email || props.name || '').toLowerCase()
  let hash = 0
  for (let i = 0; i < key.length; i++) hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0
  return String(Math.abs(hash) % 5)
})

const sizeStyle = computed(() => ({width: props.size + 'px', height: props.size + 'px', minWidth: props.size + 'px'}))
</script>

<style scoped>
.lq-person-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: linear-gradient(145deg, #eef2ff, #dbe5f6);
  color: #627ba0;
  overflow: hidden;
  flex: none;
}
.lq-person-avatar[data-tone="1"] { background: linear-gradient(145deg, #e9f6ef, #d8eade); color: #5d856c; }
.lq-person-avatar[data-tone="2"] { background: linear-gradient(145deg, #f5edfc, #e8ddf3); color: #8a6da7; }
.lq-person-avatar[data-tone="3"] { background: linear-gradient(145deg, #fff4e4, #f3e4cc); color: #a18453; }
.lq-person-avatar[data-tone="4"] { background: linear-gradient(145deg, #e8f8fb, #d5edf0); color: #598e98; }
.lq-person-avatar svg { width: 58%; height: 58%; display: block; }
.lq-person-avatar.lq-brand-avatar { background: #fff; border: 1px solid #e9e9ee; padding: 5px; }
.lq-person-avatar img { width: 100%; height: 100%; object-fit: contain; display: block; }
:global(.dark) .lq-person-avatar { filter: brightness(.85); }
</style>
