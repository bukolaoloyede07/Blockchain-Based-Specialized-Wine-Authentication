;; Provenance Contract
;; Documents chain of custody from vineyard to consumer

(define-data-var admin principal tx-sender)

;; Enum for custody event types
(define-constant CUSTODY-BOTTLED u1)
(define-constant CUSTODY-SHIPPED u2)
(define-constant CUSTODY-RECEIVED u3)
(define-constant CUSTODY-SOLD u4)

;; Map to store provenance records
(define-map provenance-records
  {bottle-id: (string-utf8 50), event-id: uint}
  {
    event-type: uint,
    from-principal: principal,
    to-principal: (optional principal),
    timestamp: uint,
    location: (string-utf8 100),
    notes: (string-utf8 200)
  }
)

;; Map to track the current owner of each bottle
(define-map bottle-owners
  (string-utf8 50)
  principal
)

;; Map to track the event count for each bottle
(define-map bottle-event-counts
  (string-utf8 50)
  uint
)

;; Check if caller is admin
(define-private (is-admin)
  (is-eq tx-sender (var-get admin))
)

;; Get the next event ID for a bottle
(define-private (get-next-event-id (bottle-id (string-utf8 50)))
  (let ((current-count (default-to u0 (map-get? bottle-event-counts bottle-id))))
    (+ current-count u1)
  )
)

;; Record a custody event
(define-public (record-custody-event
    (bottle-id (string-utf8 50))
    (event-type uint)
    (to-principal (optional principal))
    (location (string-utf8 100))
    (notes (string-utf8 200)))
  (let (
    (next-event-id (get-next-event-id bottle-id))
    (current-owner (default-to tx-sender (map-get? bottle-owners bottle-id)))
  )
    (begin
      ;; Only the current owner or admin can record events
      (asserts! (or (is-eq tx-sender current-owner) (is-admin)) (err u1))

      ;; Validate event type
      (asserts! (or
        (is-eq event-type CUSTODY-BOTTLED)
        (is-eq event-type CUSTODY-SHIPPED)
        (is-eq event-type CUSTODY-RECEIVED)
        (is-eq event-type CUSTODY-SOLD)
      ) (err u2))

      ;; Record the event
      (map-set provenance-records
        {bottle-id: bottle-id, event-id: next-event-id}
        {
          event-type: event-type,
          from-principal: tx-sender,
          to-principal: to-principal,
          timestamp: block-height,
          location: location,
          notes: notes
        }
      )

      ;; Update the event count
      (map-set bottle-event-counts bottle-id next-event-id)

      ;; If this is a transfer event (SOLD or SHIPPED), update the owner
      (if (and
        (or (is-eq event-type CUSTODY-SOLD) (is-eq event-type CUSTODY-SHIPPED))
        (is-some to-principal)
      )
        (map-set bottle-owners bottle-id (unwrap! to-principal (err u3)))
        true
      )

      (ok next-event-id)
    )
  )
)

;; Initialize a new bottle (typically called by a vineyard)
(define-public (initialize-bottle (bottle-id (string-utf8 50)))
  (begin
    ;; Check if the bottle already exists
    (asserts! (is-none (map-get? bottle-owners bottle-id)) (err u1))

    ;; Set the initial owner to the caller
    (map-set bottle-owners bottle-id tx-sender)

    ;; Initialize the event count
    (map-set bottle-event-counts bottle-id u0)

    (ok true)
  )
)

;; Get the current owner of a bottle
(define-read-only (get-bottle-owner (bottle-id (string-utf8 50)))
  (map-get? bottle-owners bottle-id)
)

;; Get a specific provenance record
(define-read-only (get-provenance-record (bottle-id (string-utf8 50)) (event-id uint))
  (map-get? provenance-records {bottle-id: bottle-id, event-id: event-id})
)

;; Get the total number of events for a bottle
(define-read-only (get-bottle-event-count (bottle-id (string-utf8 50)))
  (default-to u0 (map-get? bottle-event-counts bottle-id))
)

;; Transfer admin rights
(define-public (transfer-admin (new-admin principal))
  (begin
    (asserts! (is-admin) (err u1))
    (ok (var-set admin new-admin))
  )
)

