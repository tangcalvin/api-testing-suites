package com.philomath.api;

import com.jayway.jsonpath.JsonPath;
import com.philomath.api.store.ShipmentStore;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.hamcrest.Matchers.hasItem;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class ShipmentApiTest {

    private static final String VALID_SHIPMENT = """
            {
              "reference": "SHP-1001",
              "recipient": "Ada Lovelace",
              "destination": "HK",
              "weightKg": 1.25,
              "priority": "NORMAL",
              "status": "DRAFT",
              "insured": true
            }
            """;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ShipmentStore shipments;

    @BeforeEach
    void emptyStore() {
        shipments.clear();
    }

    @Test
    void createsReadsUpdatesAndDeletesAShipmentByPost() throws Exception {
        MvcResult created = mockMvc.perform(post("/api/shipments/createShipment")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(VALID_SHIPMENT))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.reference").value("SHP-1001"))
                .andExpect(jsonPath("$.destination").value("HK"))
                .andExpect(jsonPath("$.insured").value(true))
                .andReturn();
        Number id = JsonPath.read(created.getResponse().getContentAsString(), "$.id");

        mockMvc.perform(post("/api/shipments/getShipment")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"id\":" + id + "}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.recipient").value("Ada Lovelace"));

        mockMvc.perform(post("/api/shipments/queryShipments")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"page\":0,\"size\":20,\"reference\":\"SHP\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].id").value(id))
                .andExpect(jsonPath("$.page").value(0))
                .andExpect(jsonPath("$.totalElements").value(1));

        String updated = VALID_SHIPMENT.replace("\"status\": \"DRAFT\"", "\"status\": \"BOOKED\"");
        mockMvc.perform(post("/api/shipments/updateShipment")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(updated.replaceFirst("\\{", "{\"id\":" + id + ",")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("BOOKED"));

        mockMvc.perform(post("/api/shipments/deleteShipment")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"id\":" + id + "}"))
                .andExpect(status().isNoContent());

        mockMvc.perform(post("/api/shipments/getShipment")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"id\":" + id + "}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.exceptions[0].field").value("id"))
                .andExpect(jsonPath("$.exceptions[0].code").value("NotFound"));
    }

    @Test
    void publishesShipmentPostsInOpenApi() throws Exception {
        mockMvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.paths['/api/shipments/createShipment'].post.operationId").value("createShipment"))
                .andExpect(jsonPath("$.paths['/api/shipments/getShipment'].post.operationId").value("getShipment"))
                .andExpect(jsonPath("$.paths['/api/shipments/queryShipments'].post.operationId").value("queryShipments"))
                .andExpect(jsonPath("$.paths['/api/shipments/updateShipment'].post.operationId").value("updateShipment"))
                .andExpect(jsonPath("$.paths['/api/shipments/deleteShipment'].post.operationId").value("deleteShipment"))
                .andExpect(jsonPath("$.paths['/api/shipments/createShipment'].get").doesNotExist())
                .andExpect(jsonPath("$.components.schemas.ShipmentQuery.properties.page").exists())
                .andExpect(jsonPath("$.components.schemas.ShipmentId.required", hasItem("id")));
    }
}
