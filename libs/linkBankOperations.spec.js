import { Linker } from './linkBankOperations'

jest.mock('./cozyclient')
const cozyClient = require('./cozyclient')

let linker

beforeEach(function () {
  // We mock defineIndex/query so that fetchOperations returns the right operations
  const INDEX = 'index'
  cozyClient.data.defineIndex.mockReturnValue(Promise.resolve(INDEX))
  cozyClient.data.updateAttributes.mockReset()

  linker = new Linker(cozyClient)
})

describe('linker', () => {
  const bill = { amount: 110, _id: 'b1' }

  describe('addBillToOperation', () => {
    test('operation witout bills', () => {
      const operation = { _id: 123456 }

      linker.addBillToOperation(bill, operation)

      expect(cozyClient.data.updateAttributes).lastCalledWith(
        'io.cozy.bank.operations',
        123456,
        {
          bills: ['io.cozy.bills:b1']
        }
      )
    })

    test('operation with bills', () => {
      const operation = { _id: 12345, bills: ['bill1'] }

      linker.addBillToOperation(bill, operation)

      expect(cozyClient.data.updateAttributes).lastCalledWith(
        'io.cozy.bank.operations',
        12345,
        {
          bills: ['bill1', 'io.cozy.bills:b1']
        }
      )
    })

    test('operation have already this bill', () => {
      const operation = { _id: 12345, bills: ['io.cozy.bills:b1'] }

      linker.addBillToOperation(bill, operation)

      expect(cozyClient.data.updateAttributes.mock.calls.length).toBe(0)
    })
  })

  describe('addReimbursementToOperation', () => {
    test('operation without reimbursements', () => {
      const operation = { _id: 123456 }

      linker.addReimbursementToOperation(bill, operation, operation)

      expect(cozyClient.data.updateAttributes).lastCalledWith(
        'io.cozy.bank.operations',
        123456,
        {
          reimbursements: [{
            amount: 110,
            billId: 'io.cozy.bills:b1',
            operationId: 123456
          }]
        }
      )
    })

    test('operation with reimbursements', () => {
      const operation = { _id: 123456, reimbursements: ['test'] }

      linker.addReimbursementToOperation(bill, operation, operation)

      expect(cozyClient.data.updateAttributes).lastCalledWith(
        'io.cozy.bank.operations',
        123456,
        {
          reimbursements: ['test', {
            amount: 110,
            billId: 'io.cozy.bills:b1',
            operationId: 123456
          }]
        }
      )
    })

    test('operation have already the reimbursement', () => {
      const operation = {
        _id: 123456,
        reimbursements: [{
          amount: 110,
          billId: 'io.cozy.bills:b1',
          operationId: 123456
        }]
      }

      linker.addReimbursementToOperation(bill, operation, operation)

      expect(cozyClient.data.updateAttributes.mock.calls.length).toBe(0)
    })
  })

  describe('linkBillsToOperations', () => {
    const operationsInit = [
      { amount: -20, label: 'Visite chez le médecin', _id: 'o1', date: new Date(2017, 11, 13), automaticCategoryId: '400610' },
      { amount: 5, label: 'Remboursement CPAM', _id: 'o2', date: new Date(2017, 11, 15), automaticCategoryId: '400610' },
      { amount: -120, label: 'Facture SFR', _id: 'o3', date: new Date(2017, 11, 8) },
      { amount: -30, label: 'Facture SFR', _id: 'o4', date: new Date(2017, 11, 7) },
      { amount: +30, label: "Remboursemet Matériel d'escalade", _id: 'o5', date: new Date(2017, 11, 7) },
      { amount: -5.5, label: 'Burrito', _id: 'o6', date: new Date(2017, 11, 5) },
      { amount: -2.6, label: 'Salade', _id: 'o7', date: new Date(2017, 11, 6) }
    ]

    let operations

    beforeEach(function () {
      // reset operations to operationsInit values
      operations = operationsInit.map(op => ({ ...op }))
      cozyClient.data.query.mockReturnValue(Promise.resolve(operations))
    })

    const defaultOptions = {
      minAmountDelta: 1,
      maxAmountDelta: 1,
      pastWindow: 1,
      futureWindow: 1
    }

    function updateOperation (doctype, id, attributes) {
      const operation = operations.find(operation => operation._id === id)
      Object.assign(operation, attributes)
      return Promise.resolve(operation)
    }

    test('health bills', () => {
      cozyClient.data.updateAttributes.mockImplementation(updateOperation)
      const healthBills = [
        {
          _id: 'b1',
          amount: 5,
          originalAmount: 20,
          type: 'health_costs',
          originalDate: new Date(2017, 11, 13),
          date: new Date(2017, 11, 15),
          isRefund: true,
          vendor: 'Ameli'
        }
      ]
      const options = { ...defaultOptions, identifiers: ['CPAM'] }
      return linker.linkBillsToOperations(healthBills, options)
      .then(result => {
        expect(result).toEqual({
          b1: { creditOperation: operations[1], debitOperation: operations[0] }
        })
        expect(operations[0]).toMatchObject({reimbursements: [{
          billId: 'io.cozy.bills:b1',
          amount: 5,
          operationId: 'o2'
        }]})
        expect(operations[1]).toMatchObject({bills: ['io.cozy.bills:b1']})
      })
    })

    test('not health bills', () => {
      cozyClient.data.updateAttributes.mockReturnValue(Promise.resolve())
      const noHealthBills = [
        {
          _id: 'b2',
          amount: 30,
          date: new Date(2017, 11, 8),
          vendor: 'SFR'
        }
      ]
      const options = { ...defaultOptions, identifiers: ['SFR'] }
      return linker.linkBillsToOperations(noHealthBills, options)
      .then(result => {
        expect(result).toEqual({
          b2: { debitOperation: operations[3] }
        })
      })
    })
  })
})
