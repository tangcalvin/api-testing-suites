package com.philomath.api;

import com.philomath.api.store.CustomerStore;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class CustomerApiTest {

    private static final String VALID_CUSTOMER = """
            {
              "customerCode": "CUS-1001",
              "name": "Ada Lovelace",
              "email": "ada@example.com",
              "status": "ACTIVE",
              "profile": {
                "displayName": "Ada",
                "locale": "en-HK",
                "company": {
                  "name": "Harbour Trading Ltd",
                  "registrationNo": "12345678"
                }
              }
            }
            """;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private CustomerStore customers;

    @BeforeEach
    void emptyStore() {
        customers.clear();
    }

    @Test
    void createsReadsUpdatesAndDeletesACustomer() throws Exception {
        mockMvc.perform(post("/api/customers")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(VALID_CUSTOMER))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", "/api/customers/1"))
                .andExpect(jsonPath("$.customerCode").value("CUS-1001"))
                .andExpect(jsonPath("$.profile.displayName").value("Ada"))
                .andExpect(jsonPath("$.profile.company.name").value("Harbour Trading Ltd"))
                .andExpect(jsonPath("$.profile.company.registrationNo").value("12345678"));

        mockMvc.perform(get("/api/customers"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content", hasSize(1)))
                .andExpect(jsonPath("$.totalElements").value(1));

        mockMvc.perform(get("/api/customers/1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("ada@example.com"));

        String updated = VALID_CUSTOMER.replace("\"locale\": \"en-HK\"", "\"locale\": \"zh-HK\"");
        mockMvc.perform(put("/api/customers/1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(updated))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.profile.locale").value("zh-HK"));

        mockMvc.perform(delete("/api/customers/1"))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/customers/1"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.exceptions[0].field").value("id"))
                .andExpect(jsonPath("$.exceptions[0].code").value("NotFound"));
    }

    @Test
    void namesAFieldInsideTheThirdLevel() throws Exception {
        String invalid = VALID_CUSTOMER.replace("\"registrationNo\": \"12345678\"", "\"registrationNo\": \"" + "R".repeat(41) + "\"");

        mockMvc.perform(post("/api/customers")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(invalid))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.exceptions", hasSize(1)))
                .andExpect(jsonPath("$.exceptions[0].field").value("profile.company.registrationNo"))
                .andExpect(jsonPath("$.exceptions[0].code").value("Size"));
    }

    @Test
    void rejectsAnUnknownCustomerStatus() throws Exception {
        mockMvc.perform(post("/api/customers")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(VALID_CUSTOMER.replace("ACTIVE", "ARCHIVED")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.exceptions[?(@.field == 'status')].code", hasItem("InvalidEnum")));
    }
}
