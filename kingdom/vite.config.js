import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Replace 'YOUR_REPO_NAME' with your actual GitHub repository name if deploying to a project page.
// If deploying to a user page (e.g., username.github.io), set base to '/'.
const GITHUB_REPO_NAME = 'my-council-app'; // Replace with your repo name

export default defineConfig({
  plugins: [react()],
//   base: `/${GITHUB_REPO_NAME}/`, // For GitHub Project Pages
  base: '/', // For GitHub User Pages (e.g., username.github.io)
  build: {
    outDir: 'dist', // Default output directory for Vite
  },
});
