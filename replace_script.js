const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const files = execSync('git ls-files').toString().trim().split('\n');

const replacements = [
  { from: /MeatSaber_Combat/g, to: 'Combat_System' },
  { from: /meatsaber_combat/g, to: 'combat_system' },
  { from: /MeatSaberPattern/g, to: 'CombatSystemPattern' },
  { from: /meatsaberPattern/g, to: 'combatSystemPattern' },
  { from: /meatsaberFireRate/g, to: 'combatSystemFireRate' },
  { from: /meatsaberBloom/g, to: 'combatSystemBloom' },
  { from: /MeatSaberFlex/g, to: 'CombatSystemFlex' },
  { from: /MeatSaber Flex/g, to: 'Combat System Flex' },
  { from: /MEATSABER_PATTERN_LABELS/g, to: 'COMBAT_SYSTEM_PATTERN_LABELS' },
  { from: /MEATSABER/g, to: 'COMBAT_SYSTEM' },
  { from: /MeatSaber/g, to: 'CombatSystem' },
  { from: /meatsaber-/g, to: 'combat-system-' },
  { from: /meatsaber/g, to: 'combat_system' },
];

for (const file of files) {
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) continue;
  if (file === 'replace_script.js') continue;
  let content = fs.readFileSync(file, 'utf8');
  let newContent = content;
  for (const r of replacements) {
    newContent = newContent.replace(r.from, r.to);
  }
  if (newContent !== content) {
    fs.writeFileSync(file, newContent, 'utf8');
    console.log(`Updated content in ${file}`);
  }
}
