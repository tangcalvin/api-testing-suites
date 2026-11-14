package com.philomath.api.web;

import com.philomath.api.dto.Customer;
import com.philomath.api.dto.CustomerPage;
import com.philomath.api.dto.CustomerRequest;
import com.philomath.api.error.ApiErrorResponse;
import com.philomath.api.error.FieldException;
import com.philomath.api.store.CustomerStore;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.util.List;

@RestController
@RequestMapping("/api/customers")
@Tag(name = "Customers", description = "Create, read, update, and delete customers")
public class CustomerController {

    private final CustomerStore customers;

    public CustomerController(CustomerStore customers) {
        this.customers = customers;
    }

    @GetMapping
    @Operation(operationId = "listCustomers", summary = "List customers", responses = {
            @ApiResponse(responseCode = "200", description = "One page of customers",
                    content = @Content(schema = @Schema(implementation = CustomerPage.class))),
            @ApiResponse(responseCode = "400", description = "page or size is out of range",
                    content = @Content(schema = @Schema(implementation = ApiErrorResponse.class)))
    })
    public ResponseEntity<?> list(
            @Parameter(description = "Zero-based page index. Defaults to 0.",
                    schema = @Schema(type = "integer", format = "int32", minimum = "0", defaultValue = "0"))
            @RequestParam(name = "page", defaultValue = "0") int page,
            @Parameter(description = "Page size from 1 to 100. Defaults to 20.",
                    schema = @Schema(type = "integer", format = "int32", minimum = "1", maximum = "100", defaultValue = "20"))
            @RequestParam(name = "size", defaultValue = "20") int size
    ) {
        if (page < 0) {
            return constraint("page", "Min", "page must be zero or greater");
        }
        if (size < 1) {
            return constraint("size", "Min", "size must be at least 1");
        }
        if (size > 100) {
            return constraint("size", "Max", "size must be at most 100");
        }
        return ResponseEntity.ok(customers.findAll(page, size));
    }

    @GetMapping("/{id}")
    @Operation(operationId = "getCustomer", summary = "Get one customer", responses = {
            @ApiResponse(responseCode = "200", description = "Found",
                    content = @Content(schema = @Schema(implementation = Customer.class))),
            @ApiResponse(responseCode = "404", description = "Customer was not found",
                    content = @Content(schema = @Schema(implementation = ApiErrorResponse.class)))
    })
    public Customer get(@PathVariable("id") long id) {
        return customers.findById(id).orElseThrow(() -> new CustomerNotFoundException(id));
    }

    @PostMapping
    @Operation(operationId = "createCustomer", summary = "Create a customer", responses = {
            @ApiResponse(responseCode = "201", description = "Created",
                    content = @Content(schema = @Schema(implementation = Customer.class))),
            @ApiResponse(responseCode = "400", description = "One or more fields failed schema validation",
                    content = @Content(schema = @Schema(implementation = ApiErrorResponse.class)))
    })
    public ResponseEntity<Customer> create(@Valid @RequestBody CustomerRequest request) {
        Customer customer = customers.create(request);
        return ResponseEntity.created(URI.create("/api/customers/" + customer.id())).body(customer);
    }

    @PutMapping("/{id}")
    @Operation(operationId = "replaceCustomer", summary = "Replace a customer", responses = {
            @ApiResponse(responseCode = "200", description = "Replaced",
                    content = @Content(schema = @Schema(implementation = Customer.class))),
            @ApiResponse(responseCode = "400", description = "One or more fields failed schema validation",
                    content = @Content(schema = @Schema(implementation = ApiErrorResponse.class))),
            @ApiResponse(responseCode = "404", description = "Customer was not found",
                    content = @Content(schema = @Schema(implementation = ApiErrorResponse.class)))
    })
    public Customer update(@PathVariable("id") long id, @Valid @RequestBody CustomerRequest request) {
        return customers.update(id, request).orElseThrow(() -> new CustomerNotFoundException(id));
    }

    @DeleteMapping("/{id}")
    @Operation(operationId = "deleteCustomer", summary = "Delete a customer", responses = {
            @ApiResponse(responseCode = "204", description = "Deleted"),
            @ApiResponse(responseCode = "404", description = "Customer was not found",
                    content = @Content(schema = @Schema(implementation = ApiErrorResponse.class)))
    })
    public ResponseEntity<Void> delete(@PathVariable("id") long id) {
        if (!customers.delete(id)) {
            throw new CustomerNotFoundException(id);
        }
        return ResponseEntity.noContent().build();
    }

    private static ResponseEntity<ApiErrorResponse> constraint(String field, String code, String message) {
        return ResponseEntity.badRequest().body(new ApiErrorResponse(400, List.of(new FieldException(field, code, message))));
    }
}
