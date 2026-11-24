package com.philomath.api.web;

import com.philomath.api.dto.Shipment;
import com.philomath.api.dto.ShipmentEnvelope;
import com.philomath.api.dto.ShipmentId;
import com.philomath.api.dto.ShipmentQuery;
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
@Tag(name = "Shipments", description = "Create, read, update, and delete shipments. Every call is POST. Attributes sit under data with a userId, and every reply has code, message, and exception.")
public class ShipmentController {

    private final ShipmentStore shipments;

    public ShipmentController(ShipmentStore shipments) {
        this.shipments = shipments;
    }

    @PostMapping("/createShipment")
    @io.swagger.v3.oas.annotations.Operation(operationId = "createShipment", summary = "Create a shipment", responses = {
            @ApiResponse(responseCode = "201", description = "Created",
                    content = @Content(schema = @Schema(implementation = ShipmentEnvelope.ItemReply.class))),
            @ApiResponse(responseCode = "400", description = "One or more fields failed schema validation",
                    content = @Content(schema = @Schema(implementation = ShipmentEnvelope.ErrorReply.class)))
    })
    public ResponseEntity<ShipmentEnvelope.ItemReply> createShipment(@Valid @RequestBody ShipmentEnvelope.CreateCall request) {
        Shipment shipment = shipments.create(request.data());
        return ResponseEntity.created(URI.create("/api/shipments/" + shipment.id()))
                .body(ShipmentEnvelope.item(request.userId(), shipment));
    }

    @PostMapping("/getShipment")
    @io.swagger.v3.oas.annotations.Operation(operationId = "getShipment", summary = "Get a shipment", responses = {
            @ApiResponse(responseCode = "200", description = "Found",
                    content = @Content(schema = @Schema(implementation = ShipmentEnvelope.ItemReply.class))),
            @ApiResponse(responseCode = "400", description = "The id is missing or invalid",
                    content = @Content(schema = @Schema(implementation = ShipmentEnvelope.ErrorReply.class))),
            @ApiResponse(responseCode = "404", description = "Shipment was not found",
                    content = @Content(schema = @Schema(implementation = ShipmentEnvelope.ErrorReply.class)))
    })
    public ShipmentEnvelope.ItemReply getShipment(@Valid @RequestBody ShipmentEnvelope.IdCall request) {
        Shipment shipment = shipments.findById(request.data().id())
                .orElseThrow(() -> new ShipmentNotFoundException(request.data().id()));
        return ShipmentEnvelope.item(request.userId(), shipment);
    }

    @PostMapping("/queryShipments")
    @io.swagger.v3.oas.annotations.Operation(operationId = "queryShipments", summary = "Query shipments", responses = {
            @ApiResponse(responseCode = "200", description = "One page of shipments",
                    content = @Content(schema = @Schema(implementation = ShipmentEnvelope.PageReply.class))),
            @ApiResponse(responseCode = "400", description = "size or nextCursor is out of range",
                    content = @Content(schema = @Schema(implementation = ShipmentEnvelope.ErrorReply.class)))
    })
    public ResponseEntity<?> queryShipments(@Valid @RequestBody ShipmentEnvelope.QueryCall request) {
        ShipmentQuery query = request.data() == null ? new ShipmentQuery(null, null, null, null) : request.data();
        int size = query.size() == null ? 20 : query.size();
        if (size < 1) {
            return constraint(request.userId(), "size", "Min");
        }
        if (size > 100) {
            return constraint(request.userId(), "size", "Max");
        }
        long startId;
        try {
            startId = ShipmentCursors.startId(query.nextCursor());
        } catch (IllegalArgumentException exception) {
            return constraint(request.userId(), "nextCursor", "InvalidFormat");
        }
        return ResponseEntity.ok(ShipmentEnvelope.page(request.userId(), shipments.query(startId, size, query.reference(), query.status())));
    }

    @PostMapping("/updateShipment")
    @io.swagger.v3.oas.annotations.Operation(operationId = "updateShipment", summary = "Update a shipment", responses = {
            @ApiResponse(responseCode = "200", description = "Updated",
                    content = @Content(schema = @Schema(implementation = ShipmentEnvelope.ItemReply.class))),
            @ApiResponse(responseCode = "400", description = "One or more fields failed schema validation",
                    content = @Content(schema = @Schema(implementation = ShipmentEnvelope.ErrorReply.class))),
            @ApiResponse(responseCode = "404", description = "Shipment was not found",
                    content = @Content(schema = @Schema(implementation = ShipmentEnvelope.ErrorReply.class)))
    })
    public ShipmentEnvelope.ItemReply updateShipment(@Valid @RequestBody ShipmentEnvelope.UpdateCall request) {
        Shipment shipment = shipments.update(request.data())
                .orElseThrow(() -> new ShipmentNotFoundException(request.data().id()));
        return ShipmentEnvelope.item(request.userId(), shipment);
    }

    @PostMapping("/deleteShipment")
    @io.swagger.v3.oas.annotations.Operation(operationId = "deleteShipment", summary = "Delete a shipment", responses = {
            @ApiResponse(responseCode = "200", description = "Deleted",
                    content = @Content(schema = @Schema(implementation = ShipmentEnvelope.AckReply.class))),
            @ApiResponse(responseCode = "400", description = "The id is missing or invalid",
                    content = @Content(schema = @Schema(implementation = ShipmentEnvelope.ErrorReply.class))),
            @ApiResponse(responseCode = "404", description = "Shipment was not found",
                    content = @Content(schema = @Schema(implementation = ShipmentEnvelope.ErrorReply.class)))
    })
    public ShipmentEnvelope.AckReply deleteShipment(@Valid @RequestBody ShipmentEnvelope.IdCall request) {
        if (!shipments.delete(request.data().id())) {
            throw new ShipmentNotFoundException(request.data().id());
        }
        return ShipmentEnvelope.ack(request.userId(), request.data());
    }

    private static ResponseEntity<ShipmentEnvelope.ErrorReply> constraint(String userId, String field, String constraint) {
        return ShipmentExceptionHandler.fail(
                userId,
                org.springframework.http.HttpStatus.BAD_REQUEST,
                "Schema validation error",
                List.of(ShipmentExceptionHandler.fault(field, constraint, null))
        );
    }
}
