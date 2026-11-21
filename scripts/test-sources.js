'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const SourceData = require('../sources-format.js');
const fixture = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/sources.json'), 'utf8'));
const code = fs.readFileSync(path.join(__dirname, '../courses.js'), 'utf8').replace(/loadCourses\(\);\s*$/, '');
function read(data) {
    const context = vm.createContext({ SourceData, URL, data });
    vm.runInContext(code, context);
    return JSON.parse(JSON.stringify(vm.runInContext('readSources(data)', context)));
}
test('les lecteurs Python et JavaScript conservent les mêmes champs, liens et dates', () => {
    const data = fixture();
    const rows = SourceData.toRows(data);
    const python = execFileSync('python3', ['-c', `import json,runpy,sys
reader=runpy.run_path('scripts/generate-static.py')['read_sources']
print(json.dumps(reader(sys.stdin.read())))`], { cwd: path.join(__dirname, '..'), input: JSON.stringify(data), encoding: 'utf8' });
    assert.deepEqual(rows, JSON.parse(python));
    assert.equal(rows[0].id, 'S3_UE2.8_COURS1ET2');
    assert.equal(rows[0].video_link_1, '');
    assert.equal(rows[0].video_link_2_backup, 'https://example.com/secours2');
    assert.equal(rows[0].video_link_2_date, '2026-11-22T00:16:00+01:00');
    assert.equal(rows[0].Presentiel, 'Oui');
    assert.equal(rows[1].date, '');
    assert.equal(rows[2].cours_nom, '');
    assert.equal(rows[2].pdf_link, 'https://example.com/semestre1');
    assert.deepEqual(SourceData.toRows(SourceData.fromRows(rows)), rows);
    assert.equal(read(data).filter(row => row.cours_nom).length, 2);
});
test('une structure incorrecte est refusée avant tout affichage', () => {
    const changes = [
        data => { data.semestres = {}; },
        data => { data.semestres[0].numero = '3'; },
        data => { data.semestres.push(data.semestres[0]); },
        data => { data.semestres[0].ues.push(data.semestres[0].ues[0]); },
        data => { data.semestres[0].ues[0].cours[0].visio = 'Oui'; },
        data => { data.semestres[0].ues[0].cours[0].ressources.videos.push({ url: 'https://example.com/3' }); },
        data => { data.semestres[0].ues[0].cours[0].ressources.pdf.ajout_le = '22/11/2026'; },
        data => { data.semestres[0].ues[0].cours[0].ressources = null; },
        data => { data.semestres[0].ues[0].cours[0].nom = 42; },
        data => { data.semestres[0].ues[0].cours[0].id = ''; },
        data => { data.semestres[0].ues[0].cours[1].id = data.semestres[0].ues[0].cours[0].id; },
        data => { data.semestres[0].ues[0].cours[0].date = '31/11/2026'; },
        data => { data.semestres[0].ues[0].cours[0].ressources.pdf.url = 'javascript:alert(1)'; },
    ];
    for (const change of changes) { const data = fixture(); change(data); assert.throws(() => read(data)); }
});
