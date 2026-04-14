const { execSync } = require('child_process');
try {
  const r = execSync('openclaw cron add --name "bridge-monitor" --every 15s --channel telegram --to 6187953274 --announce --session isolated --tools exec,read,write --timeout-seconds 30 --message "Run: node C:/Users/Brian/.openclaw/workspace/skills/opencode-bridge/scripts/scan.cjs - if output is NO_MESSAGES reply HEARTBEAT_OK, otherwise forward bridge messages to user" --light-context', {
    timeout: 15000,
    shell: 'cmd.exe',
    stdio: 'pipe',
    env: { ...process.env }
  });
  console.log('ok', r.toString());
} catch (e) {
  console.log('err', e.status, e.stderr?.toString().substring(0, 500) || e.message);
}
