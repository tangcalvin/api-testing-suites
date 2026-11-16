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
import static org.hamcrest.Matchers.not;
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
                        .content("{\"nextCursor\":\"0\",\"size\":20,\"reference\":\"SHP\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].id").value(id))
                .andExpect(jsonPath("$.totalSize").value(1))
                .andExpect(jsonPath("$.nextCursor").value("0"))
                .andExpect(jsonPath("$.totalElements").doesNotExist());

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
    void storesDateTimeAndEmptyPackaging() throws Exception {
        mockMvc.perform(post("/api/shipments/createShipment")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "reference": "SHP-2002",
                                  "recipient": "Ada Lovelace",
                                  "destination": "HK",
                                  "weightKg": 1.25,
                                  "priority": "NORMAL",
                                  "status": "DRAFT",
                                  "insured": true,
                                  "readyDate": "2026-03-01",
                                  "cutoffTime": "18:30:00",
                                  "bookedAt": "2026-03-01T10:15:30Z",
                                  "packaging": {}
                                }
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.readyDate").value("2026-03-01"))
                .andExpect(jsonPath("$.cutoffTime").value("18:30:00"))
                .andExpect(jsonPath("$.bookedAt").value("2026-03-01T10:15:30Z"))
                .andExpect(jsonPath("$.packaging").isMap())
                .andExpect(jsonPath("$.packaging").isEmpty());
    }

    @Test
    void queryPagesWithHashedCursorAndPageSize() throws Exception {
        mockMvc.perform(post("/api/shipments/createShipment")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(VALID_SHIPMENT))
                .andExpect(status().isCreated());
        mockMvc.perform(post("/api/shipments/createShipment")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(VALID_SHIPMENT.replace("SHP-1001", "SHP-1002")))
                .andExpect(status().isCreated());

        MvcResult first = mockMvc.perform(post("/api/shipments/queryShipments")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"nextCursor\":\"0\",\"size\":1}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.totalSize").value(1))
                .andExpect(jsonPath("$.nextCursor").value(not("0")))
                .andReturn();
        String next = JsonPath.read(first.getResponse().getContentAsString(), "$.nextCursor");

        mockMvc.perform(post("/api/shipments/queryShipments")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"nextCursor\":\"" + next + "\",\"size\":1}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.totalSize").value(1))
                .andExpect(jsonPath("$.nextCursor").value("0"));
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
                .andExpect(jsonPath("$.components.schemas.ShipmentQuery.properties.nextCursor").exists())
                .andExpect(jsonPath("$.components.schemas.ShipmentQuery.properties.page").doesNotExist())
                .andExpect(jsonPath("$.components.schemas.ShipmentPage.properties.totalSize").exists())
                .andExpect(jsonPath("$.components.schemas.ShipmentPage.properties.totalElements").doesNotExist())
                .andExpect(jsonPath("$.components.schemas.ShipmentRequest.properties.readyDate").exists())
                .andExpect(jsonPath("$.components.schemas.ShipmentRequest.properties.cutoffTime").exists())
                .andExpect(jsonPath("$.components.schemas.ShipmentRequest.properties.bookedAt").exists())
                .andExpect(jsonPath("$.components.schemas.ShipmentRequest.properties.packaging").exists())
                .andExpect(jsonPath("$.components.schemas.ShipmentId.required", hasItem("id")));
    }
}
