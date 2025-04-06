import { describe, it, expect, beforeEach } from "vitest"

// Mock principal addresses
const ADMIN_ADDRESS = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM"
const VINEYARD_ADDRESS = "ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG"
const DISTRIBUTOR_ADDRESS = "ST2JHG361ZXG51QTKY2NQCVBPPRRE2KZB1HR05NNC"
const RETAILER_ADDRESS = "ST2NEB84ASENDXKYGJPQW86YXQCEFTWKC8XVJR6DZ"
const CONSUMER_ADDRESS = "ST2REHHS5J3CERCRBEPMGH7921Q6PYKAADT7JP2VB"

describe("Provenance Contract", () => {
  // Constants for event types
  const CUSTODY_BOTTLED = 1
  const CUSTODY_SHIPPED = 2
  const CUSTODY_RECEIVED = 3
  const CUSTODY_SOLD = 4
  
  // Mock contract state
  let mockState = {
    admin: ADMIN_ADDRESS,
    bottleOwners: {},
    bottleEventCounts: {},
    provenanceRecords: {},
  }
  
  // Mock block height
  let blockHeight = 100
  
  // Mock contract functions
  const mockContract = {
    isAdmin: () => mockState.admin === global.txSender,
    
    getNextEventId: (bottleId) => {
      return (mockState.bottleEventCounts[bottleId] || 0) + 1
    },
    
    initializeBottle: (bottleId) => {
      // Check if the bottle already exists
      if (mockState.bottleOwners[bottleId]) {
        return { error: 1 }
      }
      
      // Set the initial owner to the caller
      mockState.bottleOwners[bottleId] = global.txSender
      
      // Initialize the event count
      mockState.bottleEventCounts[bottleId] = 0
      
      return { success: true }
    },
    
    recordCustodyEvent: (bottleId, eventType, toPrincipal, location, notes) => {
      const currentOwner = mockState.bottleOwners[bottleId] || global.txSender
      const nextEventId = mockContract.getNextEventId(bottleId)
      
      // Only the current owner or admin can record events
      if (!(global.txSender === currentOwner || mockContract.isAdmin())) {
        return { error: 1 }
      }
      
      // Validate event type
      if (![CUSTODY_BOTTLED, CUSTODY_SHIPPED, CUSTODY_RECEIVED, CUSTODY_SOLD].includes(eventType)) {
        return { error: 2 }
      }
      
      // Record the event
      const key = `${bottleId}-${nextEventId}`
      mockState.provenanceRecords[key] = {
        eventType,
        fromPrincipal: global.txSender,
        toPrincipal,
        timestamp: blockHeight,
        location,
        notes,
      }
      
      // Update the event count
      mockState.bottleEventCounts[bottleId] = nextEventId
      
      // If this is a transfer event (SOLD or SHIPPED), update the owner
      if ((eventType === CUSTODY_SOLD || eventType === CUSTODY_SHIPPED) && toPrincipal) {
        mockState.bottleOwners[bottleId] = toPrincipal
      }
      
      return { success: nextEventId }
    },
    
    getBottleOwner: (bottleId) => {
      return mockState.bottleOwners[bottleId] || null
    },
    
    getProvenanceRecord: (bottleId, eventId) => {
      const key = `${bottleId}-${eventId}`
      return mockState.provenanceRecords[key] || null
    },
    
    getBottleEventCount: (bottleId) => {
      return mockState.bottleEventCounts[bottleId] || 0
    },
    
    transferAdmin: (newAdmin) => {
      if (!mockContract.isAdmin()) {
        return { error: 1 }
      }
      
      mockState.admin = newAdmin
      return { success: true }
    },
  }
  
  beforeEach(() => {
    // Reset state before each test
    mockState = {
      admin: ADMIN_ADDRESS,
      bottleOwners: {},
      bottleEventCounts: {},
      provenanceRecords: {},
    }
    
    // Reset block height
    blockHeight = 100
    
    // Set default transaction sender
    global.txSender = ADMIN_ADDRESS
  })
  
  it("should initialize a new bottle", () => {
    const result = mockContract.initializeBottle("bottle-123")
    
    expect(result).toHaveProperty("success", true)
    expect(mockContract.getBottleOwner("bottle-123")).toBe(ADMIN_ADDRESS)
    expect(mockContract.getBottleEventCount("bottle-123")).toBe(0)
  })
  
  it("should not initialize a bottle that already exists", () => {
    // First initialize the bottle
    mockContract.initializeBottle("bottle-123")
    
    // Then try to initialize it again
    const result = mockContract.initializeBottle("bottle-123")
    
    expect(result).toHaveProperty("error", 1)
  })
  
  it("should record a bottling event", () => {
    // First initialize the bottle
    mockContract.initializeBottle("bottle-123")
    
    // Then record a bottling event
    const result = mockContract.recordCustodyEvent(
        "bottle-123",
        CUSTODY_BOTTLED,
        null,
        "Vineyard Bottling Facility",
        "Bottled from Vintage 2020",
    )
    
    expect(result).toHaveProperty("success", 1)
    expect(mockContract.getBottleEventCount("bottle-123")).toBe(1)
    
    const record = mockContract.getProvenanceRecord("bottle-123", 1)
    expect(record).toEqual({
      eventType: CUSTODY_BOTTLED,
      fromPrincipal: ADMIN_ADDRESS,
      toPrincipal: null,
      timestamp: 100,
      location: "Vineyard Bottling Facility",
      notes: "Bottled from Vintage 2020",
    })
  })
  
  it("should record a shipping event and transfer ownership", () => {
    // First initialize the bottle and record bottling
    mockContract.initializeBottle("bottle-123")
    mockContract.recordCustodyEvent(
        "bottle-123",
        CUSTODY_BOTTLED,
        null,
        "Vineyard Bottling Facility",
        "Bottled from Vintage 2020",
    )
    
    // Then record a shipping event
    const result = mockContract.recordCustodyEvent(
        "bottle-123",
        CUSTODY_SHIPPED,
        DISTRIBUTOR_ADDRESS,
        "Shipping Warehouse",
        "Shipped to distributor",
    )
    
    expect(result).toHaveProperty("success", 2)
    expect(mockContract.getBottleEventCount("bottle-123")).toBe(2)
    expect(mockContract.getBottleOwner("bottle-123")).toBe(DISTRIBUTOR_ADDRESS)
    
    const record = mockContract.getProvenanceRecord("bottle-123", 2)
    expect(record).toEqual({
      eventType: CUSTODY_SHIPPED,
      fromPrincipal: ADMIN_ADDRESS,
      toPrincipal: DISTRIBUTOR_ADDRESS,
      timestamp: 100,
      location: "Shipping Warehouse",
      notes: "Shipped to distributor",
    })
  })
  
  it("should not allow unauthorized users to record events", () => {
    // First initialize the bottle as admin
    mockContract.initializeBottle("bottle-123")
    
    // Then try to record an event as unauthorized user
    global.txSender = CONSUMER_ADDRESS
    
    const result = mockContract.recordCustodyEvent(
        "bottle-123",
        CUSTODY_BOTTLED,
        null,
        "Fake Location",
        "Unauthorized event",
    )
    
    expect(result).toHaveProperty("error", 1)
    expect(mockContract.getBottleEventCount("bottle-123")).toBe(0)
  })
})

