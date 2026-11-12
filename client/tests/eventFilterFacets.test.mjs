import test from 'node:test';
import assert from 'node:assert/strict';
import {
  eventDay, matchesEventFacets, availableFacetValues, updateFilterState
} from '../src/utils/eventFilterFacets.js';

const events = [
  {region:'La Metro', municipality:'San Juan', neighborhood:'Santurce', price_type:'paid', price_min:25, start_at:'2026-11-15T20:00:00-04:00'},
  {region:'La Metro', municipality:'San Juan', neighborhood:'Viejo San Juan', price_type:'free', price_min:0, start_at:'2026-11-16T20:00:00-04:00'},
  {region:'Norte', municipality:'Arecibo', neighborhood:'Hato Abajo', price_type:'paid', price_min:10, start_at:'2026-11-15T20:00:00-04:00'},
  {region:'Sur', municipality:'Ponce', neighborhood:'Playa', price_type:'paid', price_min:0, price_max:20, start_at:'2026-11-20T20:00:00-04:00'},
  {region:'La Metro', municipality:'Bayamón', neighborhood:'Pueblo', price_type:'unknown', price_min:null, start_at:'2026-11-20T20:00:00-04:00'},
  {region:'La Metro', municipality:'San Juan', neighborhood:'Santurce', price_type:'paid', price_min:35, start_at:'2026-11-20T20:00:00-04:00'}
];
const initial = {search:'',region:'',municipality:'',neighborhood:'',fromDate:'',toDate:'',price:''};

test('Puerto Rico event dates, independent of UTC calendar day', () => {
  assert.equal(eventDay('2026-11-16T02:00:00Z'), '2026-11-15');
  assert.equal(eventDay(null), '');
});
test('all faceted predicates combine and respect price semantics', () => {
  assert.equal(events.filter(e=>matchesEventFacets(e,{...initial,region:'La Metro',fromDate:'2026-11-16',price:'free'})).length,1);
  assert.equal(events.filter(e=>matchesEventFacets(e,{...initial,price:'paid'})).length,4);
  assert.equal(events.filter(e=>matchesEventFacets(e,{...initial,fromDate:'2026-11-21'})).length,0);
});
test('region options respect price/date but ignore stale town and sector', () => {
  const values=availableFacetValues(events,{...initial,municipality:'San Juan',neighborhood:'Santurce',price:'free'},'region');
  assert.deepEqual([...values].sort(),['La Metro','Sur']);
});
test('town and neighborhood options reflect other filters', () => {
  const f={...initial,region:'La Metro',price:'paid',fromDate:'2026-11-19'};
  assert.deepEqual([...availableFacetValues(events,f,'municipality')],['San Juan']);
  assert.deepEqual([...availableFacetValues(events,{...f,municipality:'San Juan'},'neighborhood')],['Santurce']);
});
test('price options respond to selected geography and time', () => {
  assert.deepEqual([...availableFacetValues(events,{...initial,municipality:'Bayamón'},'price')],[]);
  assert.deepEqual([...availableFacetValues(events,{...initial,region:'Sur'},'price')].sort(),['free','paid']);
});
test('town selection infers region and resets incompatible neighborhood', () => {
  const out=updateFilterState({...initial,neighborhood:'Santurce'},'municipality','Ponce',events);
  assert.equal(out.region,'Sur'); assert.equal(out.municipality,'Ponce'); assert.equal(out.neighborhood,'');
});
test('neighborhood only infers a municipality when unique', () => {
  const out=updateFilterState(initial,'neighborhood','Santurce',events);
  assert.equal(out.municipality,'San Juan');assert.equal(out.region,'La Metro');
  const repeated=[...events,{...events[0],municipality:'Bayamón'}];
  assert.equal(updateFilterState(initial,'neighborhood','Santurce',repeated).municipality,'');
});
test('editing date boundary clears an incompatible opposite boundary', () => {
  assert.equal(updateFilterState({...initial,toDate:'2026-11-15'},'fromDate','2026-11-20',events).toDate,'');
  assert.equal(updateFilterState({...initial,fromDate:'2026-11-20'},'toDate','2026-11-15',events).fromDate,'');
});
test('resetting town also resets region, resetting sector preserves town', () => {
  assert.equal(updateFilterState({...initial,region:'La Metro',municipality:'San Juan'},'municipality','',events).region,'');
  assert.equal(updateFilterState({...initial,region:'La Metro',municipality:'San Juan'},'neighborhood','',events).municipality,'San Juan');
});

test('excluding a date boundary does not reject invalid dates unnecessarily', () => {
  assert.equal(matchesEventFacets({start_at:null}, {...initial,fromDate:'2026-11-20'}, ['fromDate']), true);
  assert.equal(matchesEventFacets({start_at:null}, {...initial,fromDate:'2026-11-20'}), false);
});

test('search-scoped facet sets only consider supplied search matches', () => {
  assert.deepEqual([...availableFacetValues(events.slice(0, 2), initial, 'region')], ['La Metro']);
});
