const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(function(file) {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) { 
      if (!file.includes('node_modules') && !file.includes('.git')) {
        results = results.concat(walk(file));
      }
    } else { 
      if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.md')) {
        results.push(file);
      }
    }
  });
  return results;
}

const files = walk('.');

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
  if (file === 'replace_script2.js' || file === 'replace_script.js') continue;
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
