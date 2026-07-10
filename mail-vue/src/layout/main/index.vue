<template>
  <div class="main-box">
    <router-view class="main-view" v-slot="{ Component, route }">
      <keep-alive :include="['email','spam','all-email','send','sys-setting','star','user','sub-account','role','analysis','reg-key','draft','asset-overview','email-assets']">
        <component :is="Component" :key="route.name"/>
      </keep-alive>
    </router-view>
  </div>
</template>

<script setup>
import {useUiStore} from "@/store/ui.js";
import {useSettingStore} from "@/store/setting.js";
import {watch} from "vue";

const settingStore = useSettingStore()
const uiStore = useUiStore();

let elNotification = null

watch(() => uiStore.changeNotice, () => {

  const settings = settingStore.settings

  let data = {
    notice: settings.notice,
    noticeWidth: settings.noticeWidth,
    noticeTitle: settings.noticeTitle,
    noticeContent: settings.noticeContent,
    noticeType: settings.noticeType,
    noticeDuration: settings.noticeDuration,
    noticePosition: settings.noticePosition,
    noticeOffset: settings.noticeOffset
  }

  showNotice(data)
})

watch(() => uiStore.changePreview, () => {
  showNotice(uiStore.previewData)
})

function showNotice(data) {

  if (data.notice === 1) {
    return;
  }

  if (elNotification) {
    elNotification.close()
  }

  const style = document.createElement('style');
  style.innerHTML = `
  .custom-notice.el-notification {
    --el-notification-width: min(${data.noticeWidth}px,calc(100% - 30px)) !important;
  }
  `;

  document.head.appendChild(style);

  elNotification = ElNotification({
    title: data.noticeTitle,
    message: `<div style="width: 100%;height: 100%;">${data.noticeContent}</div>`,
    type: data.noticeType === 'none' ? '' : data.noticeType,
    duration: data.noticeDuration,
    position: data.noticePosition,
    offset: data.noticeOffset,
    dangerouslyUseHTMLString: true,
    customClass: 'custom-notice'
  })
}
</script>

<style lang="scss" scoped>
.main-box {
  display: grid;
  grid-template-columns: 1fr;
  height: calc(100% - 60px);
}

.main-view {
  background: var(--el-bg-color);
}

.navigation {
  height: 30px;
  border-bottom: solid 1px var(--el-menu-border-color);
  display: inline-flex;
  justify-items: center;
  align-items: center;
  width: 100%;

  .tag {
    background: var(--el-bg-color);
    margin-left: 5px;
  }
}
</style>
