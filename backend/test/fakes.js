/**
 * Fake Supabase query builder for tests. Captures table/operation/filters and
 * resolves via a per-test handler, so services run against deterministic
 * data without a live database.
 */
export function makeQueryBuilder(handler, table) {
  const state = { table, op: 'select', filters: [], values: null, single: false }
  const builder = {
    select() {
      return builder
    },
    insert(values) {
      state.op = 'insert'
      state.values = values
      return builder
    },
    update(values) {
      state.op = 'update'
      state.values = values
      return builder
    },
    upsert(values) {
      state.op = 'upsert'
      state.values = values
      return builder
    },
    delete() {
      state.op = 'delete'
      return builder
    },
    eq(col, val) {
      state.filters.push({ type: 'eq', col, val })
      return builder
    },
    gte(col, val) {
      state.filters.push({ type: 'gte', col, val })
      return builder
    },
    lte(col, val) {
      state.filters.push({ type: 'lte', col, val })
      return builder
    },
    order() {
      return builder
    },
    limit() {
      return builder
    },
    single() {
      state.single = true
      return builder
    },
    then(onFulfilled, onRejected) {
      return Promise.resolve(handler(state)).then(onFulfilled, onRejected)
    },
  }
  return builder
}

export function makeFakeClient(handler) {
  return {
    from: (table) => makeQueryBuilder(handler, table),
    auth: {},
  }
}

export function makeAuthClient(getUserResult) {
  return {
    auth: {
      getUser: async () => getUserResult,
    },
  }
}
