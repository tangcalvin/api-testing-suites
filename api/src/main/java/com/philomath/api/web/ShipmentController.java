package com.philomath.api.web;

import com.philomath.api.dto.Shipment;
import com.philomath.api.dto.ShipmentId;
import com.philomath.api.dto.ShipmentQuery;
import com.philomath.api.dto.ShipmentRequest;
import com.philomath.api.dto.ShipmentUpdate;
import com.philomath.api.error.ApiErrorResponse;
import com.philomath.api.error.FieldException;
import com.philomath.api.store.ShipmentCursors;
import com.philomath.api.store.ShipmentStore;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.util.List;

@RestController
@RequestMapping("/api/shipments")
@Tag(name = "Shipments", description = "Create, read, update, and delete shipments. Every call is POST and the id travels in the payload.")
public class ShipmentController {

    private final ShipmentStore shipments;

    public ShipmentController(ShipmentStore shipments) {
        this.shipments = shipments;
    }

    @PostMapping("/createShipment")
    @io.swagger.v3.oas.annotations.Operation(operationId = "createShipment", summary = "Create a shipment", responses = {
            @ApiResponse(responseCode = "201", description = "Created",
                    content = @Content(schema = @Schema(implementation = Shipment.class))),
            @ApiResponse(responseCode = "400", description = "One or more fields failed schema validation",
                    content = @Content(schema = @Schema(implementation = ApiErrorResponse.class)))
    })
    public ResponseEntity<Shipment> createShipment(@Valid @RequestBody ShipmentRequest request) {
        Shipment shipment = shipments.create(request);
        return ResponseEntity.created(URI.create("/api/shipments/" + shipment.id())).body(shipment);
    }

    @PostMapping("/getShipment")
    @io.swagger.v3.oas.annotations.Operation(operationId = "getShipment", summary = "Get a shipment", responses = {
            @ApiResponse(responseCode = "200", description = "Found",
                    content = @Content(schema = @Schema(implementation = Shipment.class))),
            @ApiResponse(responseCode = "400", description = "The id is missing or invalid",
                    content = @Content(schema = @Schema(implementation = ApiErrorResponse.class))),
            @ApiResponse(responseCode = "404", description = "Shipment was not found",
                    content = @Content(schema = @Schema(implementation = ApiErrorResponse.class)))
    })
    public Shipment getShipment(@Valid @RequestBody ShipmentId request) {
        return shipments.findById(request.id()).orElseThrow(() -> new ShipmentNotFoundException(request.id()));
    }

    @PostMapping("/queryShipments")
    @io.swagger.v3.oas.annotations.Operation(operationId = "queryShipments", summary = "Query shipments", responses = {
            @ApiResponse(responseCode = "200", description = "One page of shipments",
                    content = @Content(schema = @Schema(implementation = com.philomath.api.dto.ShipmentPage.class))),
            @ApiResponse(responseCode = "400", description = "size or nextCursor is out of range",
                    content = @Content(schema = @Schema(implementation = ApiErrorResponse.class)))
    })
    public ResponseEntity<?> queryShipments(@Valid @RequestBody(required = false) ShipmentQuery request) {
        ShipmentQuery query = request == null ? new ShipmentQuery(null, null, null) : request;
        int size = query.size() == null ? 20 : query.size();
        if (size < 1) {
            return constraint("size", "Min", "size must be at least 1");
        }
        if (size > 100) {
            return constraint("size", "Max", "size must be at most 100");
        }
        long startId;
        try {
            startId = ShipmentCursors.startId(query.nextCursor());
        } catch (IllegalArgumentException exception) {
            return constraint("nextCursor", "InvalidFormat", "nextCursor must be a cursor from a previous page");
        }
        return ResponseEntity.ok(shipments.query(startId, size, query.reference()));
    }

    @PostMapping("/updateShipment")
    @io.swagger.v3.oas.annotations.Operation(operationId = "updateShipment", summary = "Update a shipment", responses = {
            @ApiResponse(responseCode = "200", description = "Updated",
                    content = @Content(schema = @Schema(implementation = Shipment.class))),
            @ApiResponse(responseCode = "400", description = "One or more fields failed schema validation",
                    content = @Content(schema = @Schema(implementation = ApiErrorResponse.class))),
            @ApiResponse(responseCode = "404", description = "Shipment was not found",
                    content = @Content(schema = @Schema(implementation = ApiErrorResponse.class)))
    })
    public Shipment updateShipment(@Valid @RequestBody ShipmentUpdate request) {
        return shipments.update(request).orElseThrow(() -> new ShipmentNotFoundException(request.id()));
    }

    @PostMapping("/deleteShipment")
    @io.swagger.v3.oas.annotations.Operation(operationId = "deleteShipment", summary = "Delete a shipment", responses = {
            @ApiResponse(responseCode = "204", description = "Deleted"),
            @ApiResponse(responseCode = "400", description = "The id is missing or invalid",
                    content = @Content(schema = @Schema(implementation = ApiErrorResponse.class))),
            @ApiResponse(responseCode = "404", description = "Shipment was not found",
                    content = @Content(schema = @Schema(implementation = ApiErrorResponse.class)))
    })
    public ResponseEntity<Void> deleteShipment(@Valid @RequestBody ShipmentId request) {
        if (!shipments.delete(request.id())) {
            throw new ShipmentNotFoundException(request.id());
        }
        return ResponseEntity.noContent().build();
    }

    private static ResponseEntity<ApiErrorResponse> constraint(String field, String code, String message) {
        return ResponseEntity.badRequest().body(new ApiErrorResponse(400, List.of(new FieldException(field, code, message))));
    }
}
