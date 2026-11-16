fetch('version.json', { cache: 'no-store' }).then(response => {
  if (!response.ok) throw new Error('Version unavailable');
  return response.json();
}).then(({ version, date }) => {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (typeof version !== 'string' || Number.isNaN(parsed.getTime())) return;
  document.querySelector('#release').textContent = `Installer v${version} · ${parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}`;
}).catch(() => {});
