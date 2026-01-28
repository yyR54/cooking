<template>
  <div class="app">
    <header class="topbar">
      <div class="brand">Cooking Admin</div>
      <nav class="nav">
        <RouterLink class="link" to="/upload/video">视频上传</RouterLink>
      </nav>
    </header>

    <main class="main">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.app {
  min-height: 100vh;
  background: radial-gradient(1200px 600px at 10% 0%, rgba(99, 102, 241, 0.18), transparent),
    radial-gradient(900px 500px at 90% 10%, rgba(16, 185, 129, 0.14), transparent), #0b1020;
  color: #e5e7eb;
}
.topbar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(10, 14, 28, 0.75);
  backdrop-filter: blur(10px);
}
.brand {
  font-weight: 700;
  letter-spacing: 0.2px;
}
.nav {
  display: flex;
  gap: 10px;
}
.link {
  color: rgba(229, 231, 235, 0.85);
  text-decoration: none;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
}
.link:hover {
  background: rgba(255, 255, 255, 0.08);
}
.main {
  padding: 22px 18px 40px;
  max-width: 980px;
  margin: 0 auto;
  width: 100%;
}
</style>
